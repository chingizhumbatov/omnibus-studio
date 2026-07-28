use crate::core::error::{CoreError, Result};
use crate::core::messages::HubMessage;
use tokio::sync::mpsc;

/// A secure context passed to protocol workers (plugins) upon startup.
/// It encapsulates the channel required to communicate back to the core Data Hub.
#[derive(Clone, Debug)]
pub struct CommandContext {
    pub connection_id: String,
    hub_tx: mpsc::Sender<HubMessage>,
}

impl CommandContext {
    pub fn new(connection_id: String, hub_tx: mpsc::Sender<HubMessage>) -> Self {
        Self {
            connection_id,
            hub_tx,
        }
    }

    /// Sends a message (e.g. tag telemetry update or connection status) to the Data Hub.
    pub async fn send_to_hub(&self, msg: HubMessage) -> Result<()> {
        self.hub_tx
            .send(msg)
            .await
            .map_err(|_| CoreError::Ipc("DataHub channel closed".to_string()))
    }
}
