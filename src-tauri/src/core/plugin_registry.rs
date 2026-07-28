use std::collections::HashMap;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::core::error::Result;
use crate::core::messages::HubMessage;
use crate::protocol::connection::ConnectionWorker;
use crate::protocol::context::CommandContext;
use crate::workspace::session::{ConnectionConfig, WorkspaceSession};

// Temporary import for Mock worker (Phase 4.3)
use crate::protocol::mock::MockProtocolWorker;

/// Wrapper enum to bypass the lack of dynamic dispatch (dyn compatibility)
/// for traits with native async functions in Rust 1.75.
pub enum ActiveWorker {
    Mock(MockProtocolWorker),
    // Future plugins:
    // Tcp(TcpProtocolWorker),
    // Serial(SerialProtocolWorker),
}

impl ActiveWorker {
    pub async fn start(&mut self, config: ConnectionConfig, context: CommandContext) -> Result<()> {
        match self {
            ActiveWorker::Mock(w) => w.start(config, context).await,
        }
    }

    pub async fn stop(&mut self) -> Result<()> {
        match self {
            ActiveWorker::Mock(w) => w.stop().await,
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
            info!(
                "Instantiating MockProtocolWorker for connection: {}",
                config.connection_id
            );

            let mut worker = ActiveWorker::Mock(MockProtocolWorker::new());

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
    use crate::workspace::session::{ConnectionConfig, ConnectionType};

    #[tokio::test]
    async fn test_plugin_registry_lifecycle() {
        let (hub_tx, mut hub_rx) = mpsc::channel(100);
        let mut registry = PluginRegistry::new(hub_tx);

        let session = WorkspaceSession {
            session_id: "test_session".to_string(),
            ui_throttle_ms: 100,
            connections: vec![ConnectionConfig {
                connection_id: "conn_1".to_string(),
                connection_type: ConnectionType::Tcp {
                    ip: "127.0.0.1".to_string(),
                    port: 502,
                },
                polling_interval_ms: 50,
            }],
            devices: vec![],
        };

        // Test starting
        registry.load_workspace(&session).await.unwrap();
        assert_eq!(registry.workers.len(), 1);

        // Check if the mock worker sent the connected status
        if let Some(HubMessage::ConnectionStatus {
            connection_id,
            is_connected,
            ..
        }) = hub_rx.recv().await
        {
            assert_eq!(connection_id, "conn_1");
            assert!(is_connected);
        } else {
            panic!("Expected ConnectionStatus message");
        }

        // Test stopping
        registry.stop_all().await.unwrap();
        assert_eq!(registry.workers.len(), 0);
    }
}
