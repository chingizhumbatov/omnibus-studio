use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

/// Represents the actual parsed value of a tag.
/// It uses 64-bit precision to cover all smaller integer and float types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
pub enum TagValue {
    Integer(i64),
    Float(f64),
    String(String),
    Raw(Vec<u8>),
}

/// Represents the quality of the tag read.
/// Extremely important in SCADA systems to avoid reacting to stale or corrupted data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status")]
pub enum TagQuality {
    Good,
    Bad { reason: String },
    Unknown,
}

/// A snapshot of a tag's state at a specific point in time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagState {
    pub tag_id: String,
    pub value: TagValue,
    pub quality: TagQuality,
    pub timestamp_ms: u64,
}

/// Represents device telemetry data for the UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTelemetry {
    pub requests: u32,
    pub ok: u32,
    pub timeouts: u32,
    pub crc_errors: u32,
    pub exceptions: u32,
    pub response_time_ms: u32,
}

/// The central message contract used by all workers and plugins to communicate with the Data Hub.
/// This enum strictly controls all state mutations in the system.
#[derive(Debug)]
pub enum HubMessage {
    /// Emitted by a Connection Worker (Producer) when a new value is successfully polled.
    UpdateTag {
        connection_id: String,
        device_id: String,
        state: TagState,
    },

    /// Emitted by a Connection Worker to update telemetry stats.
    DeviceTelemetry {
        connection_id: String,
        device_id: String,
        telemetry: DeviceTelemetry,
    },

    /// Emitted by a Connection Worker to update its connectivity status.
    ConnectionStatus {
        connection_id: String,
        is_connected: bool,
        error: Option<String>,
    },

    /// Sent by the UI or a context-aware Plugin to request a write operation to hardware.
    /// The Data Hub will route this to the appropriate Connection Worker.
    WriteTag {
        connection_id: String,
        device_id: String,
        tag_id: String,
        value: TagValue,
    },

    /// Sent by the IPC layer to request the full history of a specific tag from the ring buffer.
    /// The response is delivered via a oneshot channel to avoid blocking.
    QueryHistory {
        tag_id: String,
        responder: oneshot::Sender<Vec<TagState>>,
    },

    /// Emitted by a Connection Worker to trace raw protocol packets (Rx/Tx)
    ProtocolTrace {
        connection_id: String,
        direction: String,
        payload: Vec<u8>,
        timestamp_ms: u64,
    },
}

/// Manual Clone implementation for HubMessage.
/// QueryHistory contains a oneshot::Sender which is not Clone and must never be cloned —
/// it is handled exclusively within process_message before any broadcast occurs.
impl Clone for HubMessage {
    fn clone(&self) -> Self {
        match self {
            HubMessage::UpdateTag {
                connection_id,
                device_id,
                state,
            } => HubMessage::UpdateTag {
                connection_id: connection_id.clone(),
                device_id: device_id.clone(),
                state: state.clone(),
            },
            HubMessage::DeviceTelemetry {
                connection_id,
                device_id,
                telemetry,
            } => HubMessage::DeviceTelemetry {
                connection_id: connection_id.clone(),
                device_id: device_id.clone(),
                telemetry: telemetry.clone(),
            },
            HubMessage::ProtocolTrace {
                connection_id,
                direction,
                payload,
                timestamp_ms,
            } => HubMessage::ProtocolTrace {
                connection_id: connection_id.clone(),
                direction: direction.clone(),
                payload: payload.clone(),
                timestamp_ms: *timestamp_ms,
            },
            HubMessage::ConnectionStatus {
                connection_id,
                is_connected,
                error,
            } => HubMessage::ConnectionStatus {
                connection_id: connection_id.clone(),
                is_connected: *is_connected,
                error: error.clone(),
            },
            HubMessage::WriteTag {
                connection_id,
                device_id,
                tag_id,
                value,
            } => HubMessage::WriteTag {
                connection_id: connection_id.clone(),
                device_id: device_id.clone(),
                tag_id: tag_id.clone(),
                value: value.clone(),
            },
            HubMessage::QueryHistory { .. } => {
                // oneshot::Sender is not Clone. This variant is consumed in process_message
                // before any broadcast and must never reach this path.
                unreachable!("QueryHistory must not be cloned")
            }
        }
    }
}
