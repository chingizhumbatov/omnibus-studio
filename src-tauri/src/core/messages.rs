/// Represents the raw payload of a tag read from a device.
pub type Payload = Vec<u8>;

/// Core message contract for communicating from Isolated Connection Workers
/// to the single-threaded Data Hub Manager.
#[derive(Debug)]
pub enum HubMessage {
    /// Sent when a worker successfully reads a new value for a tag.
    UpdateTag {
        tag_id: String,
        raw_payload: Payload,
    },
    /// Sent when a worker encounters a device timeout, CRC error, or electrical fault.
    DeviceFault {
        device_id: String,
        error_code: u8,
    },
    /// Sent when the OS-level port status changes (e.g., USB disconnected).
    PortStatusChange {
        port_id: String,
        is_open: bool,
    },
}
