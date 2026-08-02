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
    pub async fn start(&mut self, config: ConnectionConfig, context: CommandContext, command_rx: tokio::sync::mpsc::Receiver<crate::protocol::connection::WorkerCommand>) -> Result<()> {
        match self {
            ActiveWorker::Mock(w) => w.start(config, context, command_rx).await,
            ActiveWorker::Serial(w) => w.start(config, context, command_rx).await,
            ActiveWorker::Tcp(w) => w.start(config, context, command_rx).await,
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

    /// Command channels for sending instructions (e.g. WriteTag) to running workers
    worker_txs: HashMap<String, mpsc::Sender<crate::protocol::connection::WorkerCommand>>,

    /// Channel for sending data from plugins to DataHub
    hub_tx: mpsc::Sender<HubMessage>,

    /// Channel for sending raw traffic to Sniffer
    sniffer_tx: tokio::sync::broadcast::Sender<crate::core::messages::SnifferMessage>,
}

impl PluginRegistry {
    pub fn new(hub_tx: mpsc::Sender<HubMessage>, sniffer_tx: tokio::sync::broadcast::Sender<crate::core::messages::SnifferMessage>) -> Self {
        Self {
            workers: HashMap::new(),
            worker_txs: HashMap::new(),
            hub_tx,
            sniffer_tx,
        }
    }

    /// Load configurations from the WorkspaceSession and initialize all required plugins.
    /// Safely stops all currently running plugins before starting new ones.
    pub async fn load_workspace(&mut self, session: &WorkspaceSession) -> Result<()> {
        info!("Loading workspace session: {}", session.session_id);

        // Stop any currently running workers to ensure a clean state
        self.stop_all().await?;

        for config in &session.connections {
            // Resolve profiles for all devices on this connection
            let mut resolved_devices = Vec::new();
            for device in &config.devices {
                if let Some(profile) = session
                    .profiles
                    .iter()
                    .find(|p| p.profile_id == device.profile_id)
                {
                    resolved_devices.push((device.clone(), profile.clone()));
                } else {
                    warn!(
                        "Profile {} not found for device {}",
                        device.profile_id, device.instance_id
                    );
                }
            }

            let mut worker = match config.connection_type {
                crate::workspace::session::ConnectionType::Serial { .. } => {
                    info!(
                        "Instantiating SerialProtocolWorker for connection: {}",
                        config.connection_id
                    );
                    let adapter = ModbusRtuAdapter::new(resolved_devices);
                    ActiveWorker::Serial(SerialProtocolWorker::new(Box::new(adapter)))
                }
                crate::workspace::session::ConnectionType::Tcp { .. } => {
                    info!(
                        "Instantiating TcpProtocolWorker for TCP connection: {}",
                        config.connection_id
                    );
                    let adapter = ModbusTcpAdapter::new(resolved_devices);
                    ActiveWorker::Tcp(TcpProtocolWorker::new(Box::new(adapter)))
                }
                crate::workspace::session::ConnectionType::Mock => {
                    info!(
                        "Instantiating MockProtocolWorker for Mock connection: {}",
                        config.connection_id
                    );
                    ActiveWorker::Mock(MockProtocolWorker::new(resolved_devices))
                }
            };

            let context = CommandContext::new(config.connection_id.clone(), self.hub_tx.clone(), self.sniffer_tx.clone());

            let (tx, rx) = mpsc::channel(32);

            // Start the worker
            if let Err(e) = worker.start(config.clone(), context, rx).await {
                warn!("Failed to start worker {}: {}", config.connection_id, e);
                continue;
            }

            self.workers.insert(config.connection_id.clone(), worker);
            self.worker_txs.insert(config.connection_id.clone(), tx);
        }

        info!("Successfully loaded {} workers.", self.workers.len());

        // Send virtual tags to the Data Hub
        if !session.virtual_tags.is_empty() {
            let _ = self.hub_tx.send(crate::core::messages::HubMessage::ApplyVirtualTags {
                tags: session.virtual_tags.clone(),
            }).await;
            info!("Applied {} virtual tags to Data Hub.", session.virtual_tags.len());
        }

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
        self.worker_txs.clear();

        Ok(())
    }

    /// Start a single connection worker with specific profiles
    pub async fn connect_channel(
        &mut self,
        config: ConnectionConfig,
        profiles: Vec<crate::workspace::session::DeviceProfile>,
    ) -> Result<()> {
        let conn_id = config.connection_id.clone();
        info!("Connecting channel: {}", conn_id);

        // Ensure clean state for this channel
        self.disconnect_channel(&conn_id).await?;

        // Resolve profiles for all devices on this connection
        let mut resolved_devices = Vec::new();
        for device in &config.devices {
            if let Some(profile) = profiles.iter().find(|p| p.profile_id == device.profile_id) {
                resolved_devices.push((device.clone(), profile.clone()));
            } else {
                warn!("Profile {} not found for device {}", device.profile_id, device.instance_id);
            }
        }

        let mut worker = match config.connection_type {
            crate::workspace::session::ConnectionType::Serial { .. } => {
                info!("Instantiating SerialProtocolWorker for connection: {}", conn_id);
                let adapter = ModbusRtuAdapter::new(resolved_devices);
                ActiveWorker::Serial(SerialProtocolWorker::new(Box::new(adapter)))
            }
            crate::workspace::session::ConnectionType::Tcp { .. } => {
                info!("Instantiating TcpProtocolWorker for TCP connection: {}", conn_id);
                let adapter = ModbusTcpAdapter::new(resolved_devices);
                ActiveWorker::Tcp(TcpProtocolWorker::new(Box::new(adapter)))
            }
            crate::workspace::session::ConnectionType::Mock => {
                info!("Instantiating MockProtocolWorker for Mock connection: {}", conn_id);
                ActiveWorker::Mock(MockProtocolWorker::new(resolved_devices))
            }
        };

        let context = CommandContext::new(conn_id.clone(), self.hub_tx.clone(), self.sniffer_tx.clone());
        let (tx, rx) = mpsc::channel(32);

        if let Err(e) = worker.start(config.clone(), context, rx).await {
            warn!("Failed to start worker {}: {}", conn_id, e);
            return Err(e);
        }

        self.workers.insert(conn_id.clone(), worker);
        self.worker_txs.insert(conn_id, tx);
        Ok(())
    }

    /// Stop a single connection worker
    pub async fn disconnect_channel(&mut self, connection_id: &str) -> Result<()> {
        if let Some(mut worker) = self.workers.remove(connection_id) {
            info!("Stopping worker for connection: {}", connection_id);
            if let Err(e) = worker.stop().await {
                warn!("Error stopping worker {}: {}", connection_id, e);
            }
            self.worker_txs.remove(connection_id);
        }
        Ok(())
    }

    /// Send a WriteTag command to a running worker
    pub async fn write_tag(
        &self,
        connection_id: &str,
        device_id: &str,
        tag_id: &str,
        value: crate::core::messages::TagValue,
    ) -> Result<()> {
        if let Some(tx) = self.worker_txs.get(connection_id) {
            tx.send(crate::protocol::connection::WorkerCommand::WriteTag {
                device_id: device_id.to_string(),
                tag_id: tag_id.to_string(),
                value,
            }).await.map_err(|e| crate::core::error::CoreError::InvalidRequest(format!("Failed to send WriteTag to worker: {}", e)))?;
            Ok(())
        } else {
            Err(crate::core::error::CoreError::InvalidRequest(format!("No running worker for connection: {}", connection_id)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::session::ConnectionConfig;

    #[tokio::test]
    async fn test_plugin_registry_lifecycle() {
        let (hub_tx, mut hub_rx) = mpsc::channel(100);
        let (sniffer_tx, _) = tokio::sync::broadcast::channel(10);
        let mut registry = PluginRegistry::new(hub_tx, sniffer_tx);

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
            profiles: vec![],
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
