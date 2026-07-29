use crate::core::error::Result;
use crate::workspace::session::ConnectionConfig;
use crate::core::messages::TagValue;
use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub enum WorkerCommand {
    WriteTag {
        device_id: String,
        tag_id: String,
        value: TagValue,
    }
}

/// The foundational interface for all Native Plugins (Protocol Drivers).
/// This defines a standard contract for any hardware or network adapter
/// (e.g., Modbus RTU, Modbus TCP, CAN bus) to talk to the core Data Hub.
///
/// We use Rust 1.75+ native async fn in traits.
#[allow(async_fn_in_trait)]
pub trait ConnectionWorker: Send + Sync {
    /// Initializes and starts the worker asynchronously.
    /// The worker is responsible for parsing the connection configuration,
    /// establishing the hardware link, and spawning an internal polling task.
    /// It pushes telemetry updates exclusively via the provided `hub_tx`.
    async fn start(
        &mut self,
        config: ConnectionConfig,
        context: crate::protocol::context::CommandContext,
        command_rx: mpsc::Receiver<WorkerCommand>,
    ) -> Result<()>;

    /// Gracefully stops the worker's internal loops and closes underlying sockets/ports.
    async fn stop(&mut self) -> Result<()>;
}
