use std::time::Duration;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{info, warn};

use super::connection::ConnectionWorker;
use super::context::CommandContext;
use crate::core::error::Result;
use crate::core::messages::{HubMessage, TagQuality, TagState, TagValue};
use crate::workspace::session::ConnectionConfig;

/// A mock protocol worker for testing.
/// Generates synthetic data (e.g., sine waves) when no hardware is attached.
pub struct MockProtocolWorker {
    task_handle: Option<JoinHandle<()>>,
}

impl MockProtocolWorker {
    pub fn new() -> Self {
        Self { task_handle: None }
    }
}

impl Default for MockProtocolWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionWorker for MockProtocolWorker {
    async fn start(&mut self, config: ConnectionConfig, context: CommandContext) -> Result<()> {
        info!(
            "Starting MockProtocolWorker for connection: {}",
            config.connection_id
        );

        let _ = context
            .send_to_hub(HubMessage::ConnectionStatus {
                connection_id: config.connection_id.clone(),
                is_connected: true,
                error: None,
            })
            .await;

        let polling_interval = Duration::from_millis(config.polling_interval_ms);
        let ctx = context.clone();

        let handle = tokio::spawn(async move {
            let mut counter = 0;
            loop {
                sleep(polling_interval).await;

                // Generate some dummy data (sine wave)
                let val = (counter as f32 * 0.1).sin() * 100.0;

                let state = TagState {
                    tag_id: format!("{}_mock_tag_1", ctx.connection_id),
                    value: TagValue::Float(val as f64),
                    quality: TagQuality::Good,
                    timestamp_ms: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                };

                let msg = HubMessage::UpdateTag {
                    connection_id: ctx.connection_id.clone(),
                    device_id: "mock_device".to_string(),
                    state,
                };

                if let Err(e) = ctx.send_to_hub(msg).await {
                    warn!("MockProtocolWorker failed to send data to hub: {}", e);
                    break;
                }

                counter += 1;
            }
        });

        self.task_handle = Some(handle);
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        if let Some(handle) = self.task_handle.take() {
            info!("Stopping MockProtocolWorker");
            handle.abort();
        }
        Ok(())
    }
}
