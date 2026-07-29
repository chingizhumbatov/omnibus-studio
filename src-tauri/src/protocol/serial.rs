use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tokio_serial::SerialPortBuilderExt;
use tracing::info;

use super::connection::ConnectionWorker;
use super::context::CommandContext;
use super::parser::ProtocolAdapter;
use crate::core::error::{CoreError, Result};
use crate::core::messages::HubMessage;
use crate::workspace::session::{ConnectionConfig, ConnectionType};

/// Raw Serial Connection Provider (USB/RS-485).
/// Holds the port open and handles physical layer errors (like USB disconnect).
/// Does not parse protocols (e.g. Modbus) directly.
pub struct SerialProtocolWorker {
    task_handle: Option<JoinHandle<()>>,
    adapter: Option<Box<dyn ProtocolAdapter>>,
}

impl SerialProtocolWorker {
    pub fn new(adapter: Box<dyn ProtocolAdapter>) -> Self {
        Self {
            task_handle: None,
            adapter: Some(adapter),
        }
    }

    fn map_parity(parity: &str) -> tokio_serial::Parity {
        match parity.to_lowercase().as_str() {
            "odd" => tokio_serial::Parity::Odd,
            "even" => tokio_serial::Parity::Even,
            _ => tokio_serial::Parity::None,
        }
    }

    fn map_data_bits(bits: u8) -> tokio_serial::DataBits {
        match bits {
            5 => tokio_serial::DataBits::Five,
            6 => tokio_serial::DataBits::Six,
            7 => tokio_serial::DataBits::Seven,
            _ => tokio_serial::DataBits::Eight,
        }
    }

    fn map_stop_bits(bits: u8) -> tokio_serial::StopBits {
        match bits {
            2 => tokio_serial::StopBits::Two,
            _ => tokio_serial::StopBits::One,
        }
    }
}

// Default is removed because we need an adapter to construct it.

impl ConnectionWorker for SerialProtocolWorker {
    async fn start(&mut self, config: ConnectionConfig, context: CommandContext, mut command_rx: tokio::sync::mpsc::Receiver<crate::protocol::connection::WorkerCommand>) -> Result<()> {
        let (port_name, baud_rate, data_bits, parity, stop_bits) = match &config.connection_type {
            ConnectionType::Serial {
                port,
                baud_rate,
                data_bits,
                parity,
                stop_bits,
            } => (
                port.clone(),
                *baud_rate,
                *data_bits,
                parity.clone(),
                *stop_bits,
            ),
            _ => {
                return Err(CoreError::InvalidRequest(
                    "Passed non-serial config to SerialProtocolWorker".into(),
                ))
            }
        };

        info!(
            "Starting SerialProtocolWorker for {} at {} baud",
            port_name, baud_rate
        );

        // Build the serial port
        let builder = tokio_serial::new(port_name.clone(), baud_rate)
            .data_bits(Self::map_data_bits(data_bits))
            .parity(Self::map_parity(&parity))
            .stop_bits(Self::map_stop_bits(stop_bits));

        let mut stream = match builder.open_native_async() {
            Ok(s) => s,
            Err(e) => {
                return Err(CoreError::ConnectionFault {
                    port: port_name,
                    reason: format!("Failed to open port: {}", e),
                });
            }
        };

        // Disable exclusive access on Unix if needed, but tokio-serial defaults are usually fine.

        // Notify Hub that connection is successful
        let _ = context
            .send_to_hub(HubMessage::ConnectionStatus {
                connection_id: config.connection_id.clone(),
                is_connected: true,
                error: None,
            })
            .await;

        let polling_interval = Duration::from_millis(config.polling_interval_ms);
        let ctx = context.clone();
        let connection_id = config.connection_id.clone();
        let mut adapter = self
            .adapter
            .take()
            .ok_or_else(|| CoreError::InvalidRequest("Adapter missing".into()))?;

        // Start the polling loop
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    cmd = command_rx.recv() => {
                        if let Some(crate::protocol::connection::WorkerCommand::WriteTag { device_id, tag_id, value }) = cmd {
                            let _ = adapter.queue_write(&device_id, &tag_id, value);
                        } else {
                            break;
                        }
                    }
                    _ = sleep(polling_interval) => {
                        if let Some(request) = adapter.next_request() {
                            if stream.write_all(&request).await.is_ok() {
                                let mut buf = vec![0u8; 1024];
                                if let Ok(n) = stream.read(&mut buf).await {
                                    if let Ok(tags) = adapter.process_response(&buf[..n]) {
                                        for (device_id, tag) in tags {
                                            let _ = ctx
                                                .send_to_hub(HubMessage::UpdateTag {
                                                    connection_id: connection_id.clone(),
                                                    device_id,
                                                    state: tag,
                                                })
                                                .await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        self.task_handle = Some(handle);
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        if let Some(handle) = self.task_handle.take() {
            info!("Stopping SerialProtocolWorker");
            handle.abort();
        }
        Ok(())
    }
}
