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
    async fn start(&mut self, config: ConnectionConfig, context: CommandContext) -> Result<()> {
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
                            if let Some(request) = adapter.next_request() {
                                if let Err(e) = stream.write_all(&request).await {
                                    error!("Failed to write to TCP stream: {}", e);
                                    break; // Break polling loop to trigger reconnect
                                }

                                let mut buf = vec![0u8; 4096];
                                match stream.read(&mut buf).await {
                                    Ok(0) => {
                                        warn!("TCP stream closed by remote host");
                                        break; // Break polling loop to trigger reconnect
                                    }
                                    Ok(n) => {
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
                                    Err(e) => {
                                        error!("Failed to read from TCP stream: {}", e);
                                        break; // Break polling loop to trigger reconnect
                                    }
                                }
                            }
                            sleep(polling_interval).await;
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
