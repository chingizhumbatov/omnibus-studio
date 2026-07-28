use std::time::{SystemTime, UNIX_EPOCH};

use rmodbus::client::ModbusRequest;

use super::parser::ProtocolAdapter;
use crate::core::error::Result;
use crate::core::messages::{TagQuality, TagState, TagValue};
use crate::workspace::session::DeviceInstance;

pub struct ModbusTcpAdapter {
    devices: Vec<DeviceInstance>,
    current_device_idx: usize,
    inflight_device_idx: Option<usize>,
    // Note: We would ideally store the TagConfig from the profile here
    // so we know exactly what registers to poll. For now we poll a hardcoded range.
}

impl ModbusTcpAdapter {
    pub fn new(devices: Vec<DeviceInstance>) -> Self {
        Self {
            devices,
            current_device_idx: 0,
            inflight_device_idx: None,
        }
    }
}

impl ProtocolAdapter for ModbusTcpAdapter {
    fn next_request(&mut self) -> Option<Vec<u8>> {
        if self.devices.is_empty() {
            return None;
        }

        let device = &self.devices[self.current_device_idx];

        // Build a simple read holding registers request (Function 03)
        // Modbus TCP requires transaction ID. We use a static 1 for now, but in reality this should increment.
        let mut request = ModbusRequest::new(device.slave_id, rmodbus::ModbusProto::TcpUdp);
        request.tr_id = 1;

        let mut buf = Vec::new();

        match request.generate_get_holdings(0, 10, &mut buf) {
            Ok(_) => {
                // Record which device this request is for so we can parse its response
                self.inflight_device_idx = Some(self.current_device_idx);
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
        // For now, we will do a simple manual parse just to prove data flows.

        // Safe timestamp fallback
        let timestamp = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(d) => d.as_millis() as u64,
            Err(_) => 0,
        };

        let device_idx = self.inflight_device_idx.take().unwrap_or(0);
        let device_id = self
            .devices
            .get(device_idx)
            .map(|d| d.instance_id.clone())
            .unwrap_or_else(|| "unknown".to_string());

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
