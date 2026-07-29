use crate::core::messages::TagState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Event sent to the frontend when tags are updated.
/// Contains the latest state of each dirty tag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagsUpdatedEvent {
    pub tags: HashMap<String, TagState>,
}

/// Event sent to the frontend when a connection status changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatusEvent {
    pub connection_id: String,
    pub is_connected: bool,
    pub error: Option<String>,
}

/// Event sent to the frontend with updated telemetry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryUpdatedEvent {
    pub telemetry: HashMap<String, crate::core::messages::DeviceTelemetry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnifferFrame {
    pub connection_id: String,
    pub direction: String,
    pub payload: Vec<u8>,
    pub timestamp_us: u64,
}

/// Event sent to the frontend with raw sniffer traces
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnifferUpdatedEvent {
    pub frames: Vec<SnifferFrame>,
}
