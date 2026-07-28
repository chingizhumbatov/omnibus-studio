use serde::{Deserialize, Serialize};

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
}

/// A configuration for an active hardware connection worker.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub connection_id: String,
    pub connection_type: ConnectionType,
    pub polling_interval_ms: u64,
    pub devices: Vec<DeviceInstance>,
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
