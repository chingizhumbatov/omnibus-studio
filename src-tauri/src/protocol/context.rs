use crate::core::error::{CoreError, Result};
use crate::core::messages::{HubMessage, SnifferMessage, TrafficDirection};
use tokio::sync::mpsc;

/// A secure context passed to protocol workers (plugins) upon startup.
/// It encapsulates the channel required to communicate back to the core Data Hub.
#[derive(Clone, Debug)]
pub struct CommandContext {
    pub connection_id: String,
    hub_tx: mpsc::Sender<HubMessage>,
    sniffer_tx: tokio::sync::broadcast::Sender<SnifferMessage>,
}

impl CommandContext {
    pub fn new(
        connection_id: String,
        hub_tx: mpsc::Sender<HubMessage>,
        sniffer_tx: tokio::sync::broadcast::Sender<SnifferMessage>,
    ) -> Self {
        Self {
            connection_id,
            hub_tx,
            sniffer_tx,
        }
    }

    /// Sends a message (e.g. tag telemetry update or connection status) to the Data Hub.
    pub async fn send_to_hub(&self, msg: HubMessage) -> Result<()> {
        self.hub_tx
            .send(msg)
            .await
            .map_err(|_| CoreError::Ipc("DataHub channel closed".to_string()))
    }

    /// Sends a raw traffic trace to the dedicated Sniffer bus, ensuring zero-cost if no subscribers exist.
    pub fn send_sniffer_trace(&self, direction: TrafficDirection, payload: Vec<u8>) {
        if self.sniffer_tx.receiver_count() > 0 {
            let timestamp_us = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_micros() as u64;

            let _ = self.sniffer_tx.send(SnifferMessage::RawTraffic {
                port_id: self.connection_id.clone(),
                direction,
                payload,
                timestamp_us,
            });
        }
    }
}
