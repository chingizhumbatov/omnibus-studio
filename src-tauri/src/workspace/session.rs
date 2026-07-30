use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents the physical or logical connection parameters.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ConnectionType {
    Serial {
        port: String,
        baud_rate: u32,
        data_bits: u8,
        parity: String,
        stop_bits: u8,
    },
    Tcp {
        ip: String,
        port: u16,
    },
    Mock,
}

/// A configuration for an active hardware connection worker.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub connection_id: String,
    pub connection_type: ConnectionType,
    pub polling_interval_ms: u64,
    /// Timeout for waiting a response from the device, in milliseconds.
    #[serde(default = "default_response_timeout_ms")]
    pub response_timeout_ms: u64,
    pub devices: Vec<DeviceInstance>,
}

fn default_response_timeout_ms() -> u64 {
    500
}

/// An instance of a device physically connected to a specific connection.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInstance {
    pub instance_id: String,
    pub profile_id: String,
    pub connection_id: String,
    pub slave_id: u8,
}

/// The master configuration for a user's entire environment.
/// Contains all connections, instantiated devices, and global settings.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceSession {
    pub session_id: String,

    /// Throttling interval for the UI Event batching (e.g., 100ms = 10 FPS).
    pub ui_throttle_ms: u64,

    pub connections: Vec<ConnectionConfig>,
    pub profiles: Vec<DeviceProfile>,
    #[serde(default)]
    pub virtual_tags: Vec<VirtualTagConfig>,
}

/// The order of bytes for 32-bit and 64-bit values.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Default)]
pub enum ByteOrder {
    /// Big-Endian (Standard Modbus)
    #[default]
    ABCD,
    /// Word Swap (Mid-Little Endian)
    CDAB,
    /// Byte Swap
    BADC,
    /// Little-Endian
    DCBA,
}

/// The type of data stored in the register.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum DataType {
    Bool,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Float32,
    Float64,
    Raw,
}

/// The type of Modbus register.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum RegisterType {
    Holding,
    Input,
    Coil,
    Discrete,
}

/// Configuration for a specific tag (register) in a device profile.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagConfig {
    pub tag_id: String,
    pub name: Option<String>,
    pub unit: Option<String>,
    pub register_type: RegisterType,
    pub address: u16,
    pub bit_offset: Option<u8>,
    pub data_type: DataType,
    pub byte_order: Option<ByteOrder>,
    pub scale: Option<f64>,
}

/// A reusable template describing a device's memory map.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceProfile {
    pub profile_id: String,
    pub name: String,
    pub tags: Vec<TagConfig>,
}

/// Configuration for a Virtual Tag that computes its value based on other tags.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VirtualTagConfig {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub data_type: DataType,
    
    /// Map of variable names used in `expression` to source tag IDs.
    pub sources: HashMap<String, String>,
    
    /// The mathematical or logical expression (e.g., "A + 10")
    pub expression: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_session_serialization() {
        let session = WorkspaceSession {
            session_id: "default_workspace".to_string(),
            ui_throttle_ms: 100,
            connections: vec![
                ConnectionConfig {
                    connection_id: "com3_modbus".to_string(),
                    connection_type: ConnectionType::Serial {
                        port: "COM3".to_string(),
                        baud_rate: 115200,
                        data_bits: 8,
                        parity: "None".to_string(),
                        stop_bits: 1,
                    },
                    polling_interval_ms: 50,
                    devices: vec![DeviceInstance {
                        instance_id: "dev_1".to_string(),
                        profile_id: "sensor_x".to_string(),
                        connection_id: "com3_modbus".to_string(),
                        slave_id: 1,
                    }],
                },
                ConnectionConfig {
                    connection_id: "tcp_modbus".to_string(),
                    connection_type: ConnectionType::Tcp {
                        ip: "192.168.1.50".to_string(),
                        port: 502,
                    },
                    polling_interval_ms: 1000,
                    devices: vec![],
                },
            ],
            profiles: vec![],
            virtual_tags: vec![],
        };

        let json = serde_json::to_string_pretty(&session).unwrap();
        assert!(json.contains("com3_modbus"));
        assert!(json.contains("115200"));
        assert!(json.contains("tcp_modbus"));
        assert!(json.contains("192.168.1.50"));

        let deserialized: WorkspaceSession = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.connections.len(), 2);
        assert_eq!(deserialized.connections[0].devices.len(), 1);
        assert_eq!(deserialized.ui_throttle_ms, 100);
    }
}
