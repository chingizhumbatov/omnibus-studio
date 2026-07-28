use std::time::Duration;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{info, warn};

use super::connection::ConnectionWorker;
use super::context::CommandContext;
use crate::core::error::Result;
use crate::core::messages::{HubMessage, TagQuality, TagState, TagValue};
use crate::workspace::session::{ConnectionConfig, DataType, DeviceInstance, DeviceProfile};

/// A mock protocol worker for testing.
/// Generates synthetic data (e.g., sine waves) when no hardware is attached.
pub struct MockProtocolWorker {
    task_handle: Option<JoinHandle<()>>,
    devices: Vec<(DeviceInstance, DeviceProfile)>,
}

impl MockProtocolWorker {
    pub fn new(devices: Vec<(DeviceInstance, DeviceProfile)>) -> Self {
        Self {
            task_handle: None,
            devices,
        }
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

        let devices_clone = self.devices.clone();

        let handle = tokio::spawn(async move {
            let mut counter = 0;
            loop {
                sleep(polling_interval).await;

                let timestamp_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;

                for (instance, profile) in &devices_clone {
                    for tag in &profile.tags {
                        let val = match tag.data_type {
                            DataType::Float32 | DataType::Float64 => {
                                // Sine wave
                                TagValue::Float(
                                    ((counter as f64 + tag.address as f64) * 0.1).sin() * 100.0,
                                )
                            }
                            DataType::Bool => {
                                TagValue::Integer(if counter % 2 == 0 { 1 } else { 0 })
                            }
                            _ => {
                                // Linear increment
                                TagValue::Integer((counter + tag.address as i32) as i64 % 100)
                            }
                        };

                        let state = TagState {
                            tag_id: tag.tag_id.clone(),
                            value: val,
                            quality: TagQuality::Good,
                            timestamp_ms,
                        };

                        let msg = HubMessage::UpdateTag {
                            connection_id: ctx.connection_id.clone(),
                            device_id: instance.instance_id.clone(),
                            state,
                        };

                        if let Err(e) = ctx.send_to_hub(msg).await {
                            warn!("MockProtocolWorker failed to send data to hub: {}", e);
                            break;
                        }
                    }
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
