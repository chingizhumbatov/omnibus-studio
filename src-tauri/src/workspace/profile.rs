use serde::{Deserialize, Serialize};

/// Represents the data type of a specific hardware register or tag.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type")] // Used for tagged JSON serialization (e.g., { "type": "Int16" })
pub enum DataType {
    Int16,
    Uint16,
    Int32,
    Uint32,
    Float32,
    Int64,
    Uint64,
    Float64,
    String {
        length: u16,
    },
    Raw {
        length: usize,
    },
    Array {
        element_type: Box<DataType>,
        length: usize,
    },
}

/// Represents a single addressable point in a device.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagConfig {
    pub id: String,
    pub name: String,
    pub address: u16,
    pub data_type: DataType,
    pub is_writable: bool,
}

/// A template describing a physical device (e.g., a specific Modbus sensor).
/// This acts as a blueprint and is agnostic to the connection (Baud rate, IP).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceProfile {
    pub profile_id: String,
    pub name: String,
    pub description: Option<String>,
    pub tags: Vec<TagConfig>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_profile_serialization() {
        let profile = DeviceProfile {
            profile_id: "sensor_x".to_string(),
            name: "Temperature Sensor".to_string(),
            description: Some("Main sensor".to_string()),
            tags: vec![
                TagConfig {
                    id: "temp_1".to_string(),
                    name: "Temperature 1".to_string(),
                    address: 100,
                    data_type: DataType::Float32,
                    is_writable: false,
                },
                TagConfig {
                    id: "raw_data".to_string(),
                    name: "Raw Bytes".to_string(),
                    address: 200,
                    data_type: DataType::Raw { length: 16 },
                    is_writable: true,
                },
            ],
        };

        let json = serde_json::to_string_pretty(&profile).unwrap();
        assert!(json.contains("Float32"));
        assert!(json.contains("Raw"));
        assert!(json.contains("length"));

        let deserialized: DeviceProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.profile_id, "sensor_x");
        assert_eq!(deserialized.tags.len(), 2);
    }
}
