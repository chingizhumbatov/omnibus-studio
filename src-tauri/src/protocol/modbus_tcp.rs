use rmodbus::client::ModbusRequest;

use super::parser::ProtocolAdapter;
use crate::core::decoder::PayloadDecoder;
use crate::core::error::{CoreError, Result};
use crate::core::messages::TagState;
use crate::workspace::session::{DeviceInstance, DeviceProfile, RegisterType, TagConfig};

#[derive(Clone)]
pub struct PollChunk {
    pub instance_id: String,
    pub slave_id: u8,
    pub register_type: RegisterType,
    pub start_address: u16,
    pub quantity: u16,
    pub tags: Vec<TagConfig>,
}

pub struct ModbusTcpAdapter {
    chunks: Vec<PollChunk>,
    current_chunk_idx: usize,
    inflight_chunk: Option<PollChunk>,
}

impl ModbusTcpAdapter {
    pub fn new(devices: Vec<(DeviceInstance, DeviceProfile)>) -> Self {
        let mut chunks = Vec::new();

        for (instance, profile) in devices {
            // Group tags by RegisterType
            let mut holding_tags = Vec::new();
            let mut input_tags = Vec::new();
            let mut coil_tags = Vec::new();
            let mut discrete_tags = Vec::new();

            for tag in profile.tags {
                match tag.register_type {
                    RegisterType::Holding => holding_tags.push(tag),
                    RegisterType::Input => input_tags.push(tag),
                    RegisterType::Coil => coil_tags.push(tag),
                    RegisterType::Discrete => discrete_tags.push(tag),
                }
            }

            Self::build_chunks_for_type(
                &mut chunks,
                &instance,
                RegisterType::Holding,
                holding_tags,
            );
            Self::build_chunks_for_type(&mut chunks, &instance, RegisterType::Input, input_tags);
            Self::build_chunks_for_type(&mut chunks, &instance, RegisterType::Coil, coil_tags);
            Self::build_chunks_for_type(
                &mut chunks,
                &instance,
                RegisterType::Discrete,
                discrete_tags,
            );
        }

        Self {
            chunks,
            current_chunk_idx: 0,
            inflight_chunk: None,
        }
    }

    fn build_chunks_for_type(
        chunks: &mut Vec<PollChunk>,
        instance: &DeviceInstance,
        reg_type: RegisterType,
        mut tags: Vec<TagConfig>,
    ) {
        if tags.is_empty() {
            return;
        }

        // Sort by address
        tags.sort_by_key(|t| t.address);

        let mut current_tags = Vec::new();
        let mut start_addr = tags[0].address;
        let mut expected_next_addr = start_addr;

        for tag in tags {
            // If gap is greater than 0, we break the chunk
            // (A smarter chunker might allow small gaps up to e.g. 5 registers to save requests,
            // but strict 0 gap is safest to prevent Illegal Data Address)
            if tag.address > expected_next_addr {
                // Finalize current chunk
                let quantity = expected_next_addr - start_addr;
                chunks.push(PollChunk {
                    instance_id: instance.instance_id.clone(),
                    slave_id: instance.slave_id,
                    register_type: reg_type,
                    start_address: start_addr,
                    quantity: quantity.max(1), // At least 1 register
                    tags: current_tags.clone(),
                });

                // Start new chunk
                current_tags.clear();
                start_addr = tag.address;
            }

            current_tags.push(tag.clone());

            // Calculate how many registers this tag consumes
            let registers = match tag.data_type {
                crate::workspace::session::DataType::Bool => 1,
                crate::workspace::session::DataType::Int16
                | crate::workspace::session::DataType::Uint16 => 1,
                crate::workspace::session::DataType::Int32
                | crate::workspace::session::DataType::Uint32
                | crate::workspace::session::DataType::Float32 => 2,
                crate::workspace::session::DataType::Float64 => 4,
                crate::workspace::session::DataType::Raw => 1,
            };
            expected_next_addr = tag.address + registers;
        }

        // Finalize the last chunk
        if !current_tags.is_empty() {
            let quantity = expected_next_addr - start_addr;
            chunks.push(PollChunk {
                instance_id: instance.instance_id.clone(),
                slave_id: instance.slave_id,
                register_type: reg_type,
                start_address: start_addr,
                quantity: quantity.max(1),
                tags: current_tags,
            });
        }
    }
}

impl ProtocolAdapter for ModbusTcpAdapter {
    fn next_request(&mut self) -> Option<Vec<u8>> {
        if self.chunks.is_empty() {
            return None;
        }

        let chunk = self.chunks[self.current_chunk_idx].clone();

        let mut request = ModbusRequest::new(chunk.slave_id, rmodbus::ModbusProto::TcpUdp);
        request.tr_id = 1; // Modbus TCP transaction ID

        let mut buf = Vec::new();
        let res = match chunk.register_type {
            RegisterType::Holding => {
                request.generate_get_holdings(chunk.start_address, chunk.quantity, &mut buf)
            }
            RegisterType::Input => {
                request.generate_get_inputs(chunk.start_address, chunk.quantity, &mut buf)
            }
            RegisterType::Coil => {
                request.generate_get_coils(chunk.start_address, chunk.quantity, &mut buf)
            }
            RegisterType::Discrete => {
                request.generate_get_discretes(chunk.start_address, chunk.quantity, &mut buf)
            }
        };

        match res {
            Ok(_) => {
                self.inflight_chunk = Some(chunk);
                self.current_chunk_idx = (self.current_chunk_idx + 1) % self.chunks.len();
                Some(buf)
            }
            Err(_) => None,
        }
    }

    fn process_response(&mut self, payload: &[u8]) -> Result<Vec<(String, TagState)>> {
        if payload.is_empty() {
            return Ok(vec![]);
        }

        let chunk = match self.inflight_chunk.take() {
            Some(c) => c,
            None => {
                return Err(CoreError::ParsingError(
                    "No inflight chunk to map response".into(),
                ))
            }
        };

        let mut parsed_states = Vec::new();

        // payload typically contains the raw bytes of the registers.
        // For rmodbus, the raw response includes headers. The parser usually needs to strip it.
        // However, since we are doing manual parsing for MVP, we assume `payload` is the raw response packet
        // and we will just extract the data part.
        // Modbus TCP Data starts at byte 9 (Transaction ID(2), Protocol ID(2), Length(2), Unit ID(1), Function Code(1), Byte Count(1)).
        if payload.len() < 9 {
            return Err(CoreError::ParsingError(
                "Payload too short for Modbus TCP".into(),
            ));
        }

        let data_bytes = &payload[9..];

        for tag in &chunk.tags {
            match PayloadDecoder::parse_tag(
                &chunk.instance_id,
                tag,
                data_bytes,
                chunk.start_address,
            ) {
                Ok(state) => {
                    parsed_states.push((chunk.instance_id.clone(), state));
                }
                Err(e) => {
                    tracing::warn!("Failed to parse tag {}: {}", tag.tag_id, e);
                }
            }
        }

        Ok(parsed_states)
    }
}
