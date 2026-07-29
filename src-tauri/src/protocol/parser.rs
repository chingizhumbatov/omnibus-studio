use crate::core::error::Result;
use crate::core::messages::TagState;

/// ProtocolAdapter acts as a bridge between a physical transport layer (like Serial or TCP)
/// and a specific protocol (like Modbus RTU, BACnet, etc.).
/// It allows the transport worker to remain ignorant of the byte structures.
pub trait ProtocolAdapter: Send + Sync {
    /// Called by the transport worker when it is ready to send data.
    /// If the adapter has a request pending (e.g. polling a device), it returns the bytes.
    fn next_request(&mut self) -> Option<Vec<u8>>;

    /// Called by the transport worker when it receives bytes from the bus.
    /// The adapter parses the response and returns a list of updated tags along with their device_id.
    fn process_response(&mut self, payload: &[u8]) -> Result<Vec<(String, TagState)>>;

    /// Returns the device ID (instance_id) of the currently inflight request (if any).
    /// Used by the transport worker to attribute telemetry to the correct device.
    fn current_device_id(&self) -> Option<String> {
        None
    }

    /// Queues a write request for a specific tag.
    fn queue_write(&mut self, _device_id: &str, _tag_id: &str, _value: crate::core::messages::TagValue) -> Result<()> {
        Err(crate::core::error::CoreError::InvalidRequest("Write not supported by this adapter".into()))
    }
}
