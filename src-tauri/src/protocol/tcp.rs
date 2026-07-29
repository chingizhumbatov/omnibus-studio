use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{error, info, warn};

use super::connection::ConnectionWorker;
use super::context::CommandContext;
use super::parser::ProtocolAdapter;
use crate::core::error::{CoreError, Result};
use crate::core::messages::HubMessage;
use crate::workspace::session::{ConnectionConfig, ConnectionType};

/// Raw TCP Connection Provider (Ethernet/Internet).
/// Handles socket connection, auto-reconnection, and raw byte transfers.
/// Leaves protocol parsing to the injected ProtocolAdapter.
pub struct TcpProtocolWorker {
    task_handle: Option<JoinHandle<()>>,
    adapter: Option<Box<dyn ProtocolAdapter>>,
}

impl TcpProtocolWorker {
    pub fn new(adapter: Box<dyn ProtocolAdapter>) -> Self {
        Self {
            task_handle: None,
            adapter: Some(adapter),
        }
    }
}

impl ConnectionWorker for TcpProtocolWorker {
    async fn start(&mut self, config: ConnectionConfig, context: CommandContext, mut command_rx: tokio::sync::mpsc::Receiver<crate::protocol::connection::WorkerCommand>) -> Result<()> {
        let (ip, port) = match &config.connection_type {
            ConnectionType::Tcp { ip, port } => (ip.clone(), *port),
            _ => {
                return Err(CoreError::InvalidRequest(
                    "Passed non-tcp config to TcpProtocolWorker".into(),
                ))
            }
        };

        info!("Starting TcpProtocolWorker for {}:{}", ip, port);

        let polling_interval = Duration::from_millis(config.polling_interval_ms);
        let ctx = context.clone();
        let connection_id = config.connection_id.clone();
        let mut adapter = self
            .adapter
            .take()
            .ok_or_else(|| CoreError::InvalidRequest("Adapter missing".into()))?;

        // Start the connection and polling loop
        let handle = tokio::spawn(async move {
            let addr = format!("{}:{}", ip, port);
            let mut telemetry_state: std::collections::HashMap<String, crate::core::messages::DeviceTelemetry> = std::collections::HashMap::new();

            loop {
                // Connection phase
                info!("Attempting to connect to {}", addr);
                match TcpStream::connect(&addr).await {
                    Ok(mut stream) => {
                        info!("Successfully connected to {}", addr);
                        let _ = ctx
                            .send_to_hub(HubMessage::ConnectionStatus {
                                connection_id: connection_id.clone(),
                                is_connected: true,
                                error: None,
                            })
                            .await;

                        // Polling phase
                        loop {
                            tokio::select! {
                                cmd = command_rx.recv() => {
                                    if let Some(crate::protocol::connection::WorkerCommand::WriteTag { device_id, tag_id, value }) = cmd {
                                        let _ = adapter.queue_write(&device_id, &tag_id, value);
                                    } else {
                                        // command_rx was closed, exit worker
                                        break;
                                    }
                                }
                                _ = sleep(polling_interval) => {
                                    if let Some(request) = adapter.next_request() {
                                        let device_id_opt = adapter.current_device_id();
                                        let start_time = std::time::Instant::now();

                                        let _ = ctx.send_to_hub(HubMessage::ProtocolTrace {
                                            connection_id: connection_id.clone(),
                                            direction: "tx".into(),
                                            payload: request.clone(),
                                        }).await;

                                        let mut success = false;
                                        let mut is_timeout = false;
                                        let mut is_exception = false;
                                        let mut connection_dropped = false;

                                        if let Err(e) = stream.write_all(&request).await {
                                            error!("Failed to write to TCP stream: {}", e);
                                            is_timeout = true;
                                            connection_dropped = true;
                                        } else {
                                            let mut buf = vec![0u8; 4096];
                                            match stream.read(&mut buf).await {
                                                Ok(0) => {
                                                    warn!("TCP stream closed by remote host");
                                                    is_timeout = true;
                                                    connection_dropped = true;
                                                }
                                                Ok(n) => {
                                                    let _ = ctx.send_to_hub(HubMessage::ProtocolTrace {
                                                        connection_id: connection_id.clone(),
                                                        direction: "rx".into(),
                                                        payload: buf[..n].to_vec(),
                                                    }).await;

                                                    match adapter.process_response(&buf[..n]) {
                                                        Ok(tags) => {
                                                            success = true;
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
                                                        Err(e) => {
                                                            error!("Protocol parse error: {}", e);
                                                            is_exception = true;
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    error!("Failed to read from TCP stream: {}", e);
                                                    is_timeout = true;
                                                    connection_dropped = true;
                                                }
                                            }
                                        }

                                        if let Some(device_id) = device_id_opt {
                                            let entry = telemetry_state.entry(device_id.clone()).or_insert_with(|| crate::core::messages::DeviceTelemetry {
                                                requests: 0,
                                                ok: 0,
                                                timeouts: 0,
                                                crc_errors: 0,
                                                exceptions: 0,
                                                response_time_ms: 0,
                                            });

                                            entry.requests += 1;
                                            if success {
                                                entry.ok += 1;
                                                entry.response_time_ms = start_time.elapsed().as_millis() as u32;
                                            } else if is_timeout {
                                                entry.timeouts += 1;
                                            } else if is_exception {
                                                entry.exceptions += 1;
                                            }

                                            let _ = ctx.send_to_hub(HubMessage::DeviceTelemetry {
                                                connection_id: connection_id.clone(),
                                                device_id: device_id.clone(),
                                                telemetry: entry.clone(),
                                            }).await;
                                        }

                                        if connection_dropped {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Connection to {} failed: {}", addr, e);
                    }
                }

                // If we broke out of the inner loop or failed to connect, we are disconnected
                let _ = ctx
                    .send_to_hub(HubMessage::ConnectionStatus {
                        connection_id: connection_id.clone(),
                        is_connected: false,
                        error: Some("TCP Connection lost".into()),
                    })
                    .await;

                // Wait before reconnecting to prevent hot loops
                info!("Waiting 5 seconds before reconnecting to {}", addr);
                sleep(Duration::from_secs(5)).await;
            }
        });

        self.task_handle = Some(handle);
        Ok(())
    }

    async fn stop(&mut self) -> Result<()> {
        if let Some(handle) = self.task_handle.take() {
            info!("Stopping TcpProtocolWorker");
            handle.abort();
        }
        Ok(())
    }
}
