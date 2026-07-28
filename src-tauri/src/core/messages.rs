use serde::{Deserialize, Serialize};

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

/// The central message contract used by all workers and plugins to communicate with the Data Hub.
/// This enum strictly controls all state mutations in the system.
#[derive(Debug, Clone)]
pub enum HubMessage {
    /// Emitted by a Connection Worker (Producer) when a new value is successfully polled.
    UpdateTag {
        connection_id: String,
        device_id: String,
        state: TagState,
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
}
