use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Event sent to the frontend when tags are updated
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagsUpdatedEvent {
    pub tags: HashMap<String, Vec<u8>>,
}

/// Event sent to the frontend when a device encounters a fault
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceFaultEvent {
    pub device_id: String,
    pub error_code: u8,
}
