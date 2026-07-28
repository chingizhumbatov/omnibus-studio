use crate::core::error::{CoreError, Result};
use crate::core::messages::{TagQuality, TagState, TagValue};
use crate::workspace::session::{ByteOrder, DataType, TagConfig};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct PayloadDecoder;

impl PayloadDecoder {
    /// Parses a raw byte slice into a TagState based on the TagConfig rules.
    /// `payload` is expected to be the raw data slice starting from the tag's `address`.
    pub fn parse_tag(
        _device_id: &str,
        config: &TagConfig,
        payload: &[u8],
        base_address: u16,
    ) -> Result<TagState> {
        let timestamp_ms = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(d) => d.as_millis() as u64,
            Err(_) => 0,
        };

        // Calculate offset in bytes. Modbus registers are 2 bytes each.
        // The payload must start at base_address, so the offset is (config.address - base_address) * 2.
        if config.address < base_address {
            return Err(CoreError::InvalidRequest(format!(
                "Tag address {} is before base address {}",
                config.address, base_address
            )));
        }

        let offset = ((config.address - base_address) * 2) as usize;
        let required_bytes = Self::bytes_for_type(config.data_type);

        if offset + required_bytes > payload.len() {
            return Err(CoreError::ParsingError(format!(
                "Payload too short for tag {}. Need {} bytes at offset {}, but payload is {} bytes",
                config.tag_id,
                required_bytes,
                offset,
                payload.len()
            )));
        }

        let slice = &payload[offset..offset + required_bytes];
        let byte_order = config.byte_order.unwrap_or_default();

        let mut value = Self::extract_value(slice, config.data_type, byte_order)?;

        // Apply scale if present
        if let Some(scale) = config.scale {
            value = Self::apply_scale(value, scale);
        }

        Ok(TagState {
            tag_id: config.tag_id.clone(),
            value,
            quality: TagQuality::Good,
            timestamp_ms,
        })
    }

    fn bytes_for_type(dt: DataType) -> usize {
        match dt {
            DataType::Bool => 2, // Modbus packs bools in coils (1 bit) but often we read as registers (16 bit) or parse coils directly (handled differently if packed). For holding registers, it's 2 bytes.
            DataType::Int16 => 2,
            DataType::Uint16 => 2,
            DataType::Int32 => 4,
            DataType::Uint32 => 4,
            DataType::Float32 => 4,
            DataType::Float64 => 8,
            DataType::Raw => 0, // Raw usually means take whatever, but let's assume it's handled via arrays later.
        }
    }

    fn extract_value(slice: &[u8], dt: DataType, order: ByteOrder) -> Result<TagValue> {
        match dt {
            DataType::Int16 => {
                // Int16 is exactly 2 bytes. Modbus is natively Big-Endian (AB).
                // If the user specified DCBA or BADC, it means Little Endian for a 16-bit word (BA).
                let val = match order {
                    ByteOrder::ABCD | ByteOrder::CDAB => i16::from_be_bytes([slice[0], slice[1]]),
                    ByteOrder::DCBA | ByteOrder::BADC => i16::from_le_bytes([slice[0], slice[1]]),
                };
                Ok(TagValue::Integer(val as i64))
            }
            DataType::Uint16 => {
                let val = match order {
                    ByteOrder::ABCD | ByteOrder::CDAB => u16::from_be_bytes([slice[0], slice[1]]),
                    ByteOrder::DCBA | ByteOrder::BADC => u16::from_le_bytes([slice[0], slice[1]]),
                };
                Ok(TagValue::Integer(val as i64))
            }
            DataType::Float32 => {
                let b = slice;
                // Modbus doesn't define 32-bit float order. We must reorder based on ByteOrder.
                let bytes = match order {
                    ByteOrder::ABCD => [b[0], b[1], b[2], b[3]], // Big Endian
                    ByteOrder::CDAB => [b[2], b[3], b[0], b[1]], // Mid-Little Endian (Word Swap)
                    ByteOrder::BADC => [b[1], b[0], b[3], b[2]], // Byte Swap
                    ByteOrder::DCBA => [b[3], b[2], b[1], b[0]], // Little Endian
                };
                let val = f32::from_be_bytes(bytes);
                Ok(TagValue::Float(val as f64))
            }
            // For others, implement similarly. Default to 0 for now.
            _ => Ok(TagValue::Integer(0)),
        }
    }

    fn apply_scale(val: TagValue, scale: f64) -> TagValue {
        match val {
            TagValue::Integer(i) => TagValue::Float((i as f64) * scale),
            TagValue::Float(f) => TagValue::Float(f * scale),
            _ => val,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::session::RegisterType;

    #[test]
    fn test_float32_abcd() {
        // 123.456 in Float32 is 0x42F6E979
        let payload = vec![0x42, 0xF6, 0xE9, 0x79];
        let config = TagConfig {
            tag_id: "test".into(),
            name: None,
            unit: None,
            register_type: RegisterType::Holding,
            address: 0,
            bit_offset: None,
            data_type: DataType::Float32,
            byte_order: Some(ByteOrder::ABCD),
            scale: None,
        };

        let result = PayloadDecoder::parse_tag("dev", &config, &payload, 0).unwrap();
        if let TagValue::Float(f) = result.value {
            assert!((f - 123.456).abs() < 0.001);
        } else {
            panic!("Expected float");
        }
    }

    #[test]
    fn test_float32_cdab() {
        // 123.456 in CDAB is 0xE979 0x42F6
        let payload = vec![0xE9, 0x79, 0x42, 0xF6];
        let config = TagConfig {
            tag_id: "test".into(),
            name: None,
            unit: None,
            register_type: RegisterType::Holding,
            address: 0,
            bit_offset: None,
            data_type: DataType::Float32,
            byte_order: Some(ByteOrder::CDAB),
            scale: None,
        };

        let result = PayloadDecoder::parse_tag("dev", &config, &payload, 0).unwrap();
        if let TagValue::Float(f) = result.value {
            assert!((f - 123.456).abs() < 0.001);
        } else {
            panic!("Expected float");
        }
    }

    #[test]
    fn test_scale_int16() {
        let payload = vec![0x00, 254]; // Int16 = 254
        let config = TagConfig {
            tag_id: "test".into(),
            name: None,
            unit: None,
            register_type: RegisterType::Holding,
            address: 0,
            bit_offset: None,
            data_type: DataType::Int16,
            byte_order: Some(ByteOrder::ABCD),
            scale: Some(0.1),
        };

        let result = PayloadDecoder::parse_tag("dev", &config, &payload, 0).unwrap();
        if let TagValue::Float(f) = result.value {
            assert!((f - 25.4).abs() < 0.001);
        } else {
            panic!("Expected float");
        }
    }
}
