use std::time::{SystemTime, UNIX_EPOCH};

use rmodbus::client::ModbusRequest;

use super::parser::ProtocolAdapter;
use crate::core::error::Result;
use crate::core::messages::{TagQuality, TagState, TagValue};
use crate::workspace::session::DeviceInstance;

pub struct ModbusRtuAdapter {
    devices: Vec<DeviceInstance>,
    current_device_idx: usize,
    // Note: We would ideally store the TagConfig from the profile here
    // so we know exactly what registers to poll. For now we poll a hardcoded range.
}

impl ModbusRtuAdapter {
    pub fn new(devices: Vec<DeviceInstance>) -> Self {
        Self {
            devices,
            current_device_idx: 0,
        }
    }
}

impl ProtocolAdapter for ModbusRtuAdapter {
    fn next_request(&mut self) -> Option<Vec<u8>> {
        if self.devices.is_empty() {
            return None;
        }

        let device = &self.devices[self.current_device_idx];

        // Let's build a simple read holding registers request (Function 03)
        // For demonstration, we read 10 registers starting at 0.
        let mut request = ModbusRequest::new(device.slave_id, rmodbus::ModbusProto::Rtu);
        let mut buf = Vec::new();

        match request.generate_get_holdings(0, 10, &mut buf) {
            Ok(_) => {
                // Move to the next device for the next poll
                self.current_device_idx = (self.current_device_idx + 1) % self.devices.len();
                Some(buf)
            }
            Err(_) => None,
        }
    }

    fn process_response(&mut self, payload: &[u8]) -> Result<Vec<(String, TagState)>> {
        if payload.is_empty() {
            return Ok(vec![]);
        }

        // To properly parse the response using rmodbus, we need to know the context (what we requested).
        // Since we requested 10 holding registers, we expect them back.
        // For now, we will do a simple manual parse.

        // In a complete implementation, the adapter state machine would remember
        // which device and registers it just requested, and parse the payload into specific TagStates
        // based on the TagConfig of that DeviceProfile.

        // Dummy implementation to satisfy the trait:
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let device_id = self.devices[0].instance_id.clone();

        Ok(vec![(
            device_id.clone(),
            TagState {
                tag_id: format!("{}_reg_0", device_id),
                value: TagValue::Integer(payload.len() as i64),
                quality: TagQuality::Good,
                timestamp_ms: timestamp,
            },
        )])
    }
}
