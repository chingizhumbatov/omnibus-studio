use std::collections::HashMap;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::core::error::Result;
use crate::core::messages::HubMessage;
use crate::protocol::connection::ConnectionWorker;
use crate::protocol::context::CommandContext;
use crate::workspace::session::{ConnectionConfig, WorkspaceSession};

use crate::protocol::mock::MockProtocolWorker;
use crate::protocol::modbus_rtu::ModbusRtuAdapter;
use crate::protocol::modbus_tcp::ModbusTcpAdapter;
use crate::protocol::serial::SerialProtocolWorker;
use crate::protocol::tcp::TcpProtocolWorker;

/// Wrapper enum to bypass the lack of dynamic dispatch (dyn compatibility)
/// for traits with native async functions in Rust 1.75.
pub enum ActiveWorker {
    Mock(MockProtocolWorker),
    Serial(SerialProtocolWorker),
    Tcp(TcpProtocolWorker),
}

impl ActiveWorker {
    pub async fn start(&mut self, config: ConnectionConfig, context: CommandContext) -> Result<()> {
        match self {
            ActiveWorker::Mock(w) => w.start(config, context).await,
            ActiveWorker::Serial(w) => w.start(config, context).await,
            ActiveWorker::Tcp(w) => w.start(config, context).await,
        }
    }

    pub async fn stop(&mut self) -> Result<()> {
        match self {
            ActiveWorker::Mock(w) => w.stop().await,
            ActiveWorker::Serial(w) => w.stop().await,
            ActiveWorker::Tcp(w) => w.stop().await,
        }
    }
}

pub struct PluginRegistry {
    /// Active workers mapped by connection_id
    workers: HashMap<String, ActiveWorker>,

    /// Channel for sending data from plugins to DataHub
    hub_tx: mpsc::Sender<HubMessage>,
}

impl PluginRegistry {
    pub fn new(hub_tx: mpsc::Sender<HubMessage>) -> Self {
        Self {
            workers: HashMap::new(),
            hub_tx,
        }
    }

    /// Load configurations from the WorkspaceSession and initialize all required plugins.
    /// Safely stops all currently running plugins before starting new ones.
    pub async fn load_workspace(&mut self, session: &WorkspaceSession) -> Result<()> {
        info!("Loading workspace session: {}", session.session_id);

        // Stop any currently running workers to ensure a clean state
        self.stop_all().await?;

        for config in &session.connections {
            let mut worker = match config.connection_type {
                crate::workspace::session::ConnectionType::Serial { .. } => {
                    info!(
                        "Instantiating SerialProtocolWorker for connection: {}",
                        config.connection_id
                    );
                    let adapter = ModbusRtuAdapter::new(config.devices.clone());
                    ActiveWorker::Serial(SerialProtocolWorker::new(Box::new(adapter)))
                }
                crate::workspace::session::ConnectionType::Tcp { .. } => {
                    info!(
                        "Instantiating TcpProtocolWorker for TCP connection: {}",
                        config.connection_id
                    );
                    let adapter = ModbusTcpAdapter::new(config.devices.clone());
                    ActiveWorker::Tcp(TcpProtocolWorker::new(Box::new(adapter)))
                }
            };

            let context = CommandContext::new(config.connection_id.clone(), self.hub_tx.clone());

            // Start the worker
            if let Err(e) = worker.start(config.clone(), context).await {
                warn!("Failed to start worker {}: {}", config.connection_id, e);
                continue;
            }

            self.workers.insert(config.connection_id.clone(), worker);
        }

        info!("Successfully loaded {} workers.", self.workers.len());
        Ok(())
    }

    /// Gracefully stop all running plugins and remove them from the registry.
    pub async fn stop_all(&mut self) -> Result<()> {
        if self.workers.is_empty() {
            return Ok(());
        }

        info!("Stopping {} active workers...", self.workers.len());
        for (conn_id, mut worker) in self.workers.drain() {
            if let Err(e) = worker.stop().await {
                warn!("Error stopping worker {}: {}", conn_id, e);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::session::ConnectionConfig;

    #[tokio::test]
    async fn test_plugin_registry_lifecycle() {
        let (hub_tx, mut hub_rx) = mpsc::channel(100);
        let mut registry = PluginRegistry::new(hub_tx);

        let session = WorkspaceSession {
            session_id: "test_session".to_string(),
            ui_throttle_ms: 100,
            connections: vec![ConnectionConfig {
                connection_id: "conn_1".to_string(),
                connection_type: crate::workspace::session::ConnectionType::Tcp {
                    ip: "127.0.0.1".to_string(),
                    port: 5020,
                },
                polling_interval_ms: 10,
                devices: vec![],
            }],
        };

        // Test starting
        registry.load_workspace(&session).await.unwrap();
        assert_eq!(registry.workers.len(), 1);

        // Check if the worker sent the connected status (it should fail to connect to port 5020)
        if let Some(HubMessage::ConnectionStatus {
            connection_id,
            is_connected,
            ..
        }) = hub_rx.recv().await
        {
            assert_eq!(connection_id, "conn_1");
            assert!(!is_connected);
        } else {
            panic!("Expected ConnectionStatus message");
        }

        // Test stopping
        registry.stop_all().await.unwrap();
        assert_eq!(registry.workers.len(), 0);
    }
}
