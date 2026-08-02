use std::collections::{HashMap, HashSet, VecDeque};
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, mpsc};
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};
use evalexpr::ContextWithMutableVariables;

use super::messages::{HubMessage, SnifferMessage, TagState};
use crate::protocol::ipc::TagsUpdatedEvent;

const RING_BUFFER_SIZE: usize = 10_000;

struct CompiledVirtualTag {
    config: crate::workspace::session::VirtualTagConfig,
    ast: evalexpr::Node,
}

/// The central in-memory state repository (Tag Dictionary).
pub struct DataHub {
    /// Tier 1 In-Memory Ring Buffer storing the history for each tag.
    /// Key: tag_id, Value: Deque of TagState
    tag_history: HashMap<String, VecDeque<TagState>>,

    /// Tracks the status of physical ports/connections.
    port_statuses: HashMap<String, bool>,

    /// Internal set of tags that have been updated since the last UI emission.
    dirty_tags: HashSet<String>,

    /// Latest telemetry stats per device.
    telemetry: HashMap<String, crate::core::messages::DeviceTelemetry>,

    /// Internal set of devices whose telemetry has been updated since the last UI emission.
    dirty_telemetry: HashSet<String>,

    /// Compiled virtual tags for fast evaluation.
    virtual_tags: Vec<CompiledVirtualTag>,


    /// Broadcast channel for out-of-tree plugins, sniffer, and AI integrations.
    /// Every incoming message is cloned and sent out to all active subscribers.
    pub event_bus: broadcast::Sender<HubMessage>,

    /// Dedicated broadcast channel for raw protocol sniffer traffic.
    pub sniffer_bus: broadcast::Sender<SnifferMessage>,
}

impl Default for DataHub {
    fn default() -> Self {
        Self::new()
    }
}

impl DataHub {
    pub fn new() -> Self {
        let (event_bus, _) = broadcast::channel(1024);
        let (sniffer_bus, _) = broadcast::channel(1024);
        Self {
            tag_history: HashMap::new(),
            port_statuses: HashMap::new(),
            dirty_tags: HashSet::new(),
            telemetry: HashMap::new(),
            dirty_telemetry: HashSet::new(),
            virtual_tags: Vec::new(),
            event_bus,
            sniffer_bus,
        }
    }

    pub fn process_message(&mut self, msg: HubMessage) {
        match msg {
            HubMessage::UpdateTag { ref state, .. } => {
                // Broadcast to any listening plugins (ignore if no receivers)
                let _ = self.event_bus.send(msg.clone());

                let tag_id = state.tag_id.clone();
                let history = self.tag_history.entry(tag_id.clone()).or_default();

                if history.len() >= RING_BUFFER_SIZE {
                    history.pop_front();
                }
                history.push_back(state.clone());
                self.dirty_tags.insert(tag_id);
            }
            HubMessage::ConnectionStatus {
                ref connection_id,
                is_connected,
                ..
            } => {
                // Broadcast to any listening plugins (ignore if no receivers)
                let _ = self.event_bus.send(msg.clone());
                self.port_statuses
                    .insert(connection_id.clone(), is_connected);
            }
            HubMessage::DeviceTelemetry {
                ref device_id,
                ref telemetry,
                ..
            } => {
                let _ = self.event_bus.send(msg.clone());
                let current = self.telemetry.entry(device_id.clone()).or_insert_with(|| crate::core::messages::DeviceTelemetry {
                    requests: 0,
                    ok: 0,
                    timeouts: 0,
                    crc_errors: 0,
                    exceptions: 0,
                    response_time_ms: 0,
                });
                
                current.requests += telemetry.requests;
                current.ok += telemetry.ok;
                current.timeouts += telemetry.timeouts;
                current.crc_errors += telemetry.crc_errors;
                current.exceptions += telemetry.exceptions;
                current.response_time_ms = telemetry.response_time_ms; // Overwrite with latest response time

                self.dirty_telemetry.insert(device_id.clone());
            }

            HubMessage::WriteTag { .. } => {
                // Broadcast to any listening plugins (ignore if no receivers)
                let _ = self.event_bus.send(msg.clone());
                warn!("WriteTag received in DataHub but not implemented yet to route to worker");
            }
            HubMessage::ResetTelemetry { ref device_id } => {
                if let Some(current) = self.telemetry.get_mut(device_id) {
                    current.requests = 0;
                    current.ok = 0;
                    current.timeouts = 0;
                    current.crc_errors = 0;
                    current.exceptions = 0;
                    current.response_time_ms = 0;
                    self.dirty_telemetry.insert(device_id.clone());
                }
            }
            HubMessage::QueryHistory { tag_id, responder } => {
                // Do NOT broadcast this — oneshot::Sender is not Clone.
                // Respond directly with the full history snapshot.
                let history: Vec<TagState> = self
                    .tag_history
                    .get(&tag_id)
                    .map(|deque| deque.iter().cloned().collect())
                    .unwrap_or_default();

                // Ignore send error — the caller may have timed out.
                let _ = responder.send(history);
            }
            HubMessage::ApplyVirtualTags { ref tags } => {
                let _ = self.event_bus.send(msg.clone());
                self.virtual_tags.clear();
                let mut dirty = false;
                for config in tags {
                    match evalexpr::build_operator_tree(&config.expression) {
                        Ok(ast) => {
                            for source_tag_id in config.sources.values() {
                                self.dirty_tags.insert(source_tag_id.clone());
                            }
                            self.virtual_tags.push(CompiledVirtualTag { config: config.clone(), ast });
                            dirty = true;
                        }
                        Err(e) => {
                            error!("Failed to compile virtual tag '{}': {}", config.id, e);
                        }
                    }
                }
                if dirty {
                    self.evaluate_virtual_tags();
                }
            }
        }
    }

    pub fn flush_dirty_tags(&mut self) -> HashMap<String, TagState> {
        let mut updates = HashMap::with_capacity(self.dirty_tags.len());
        for tag_id in self.dirty_tags.drain() {
            if let Some(history) = self.tag_history.get(&tag_id) {
                if let Some(latest_state) = history.back() {
                    updates.insert(tag_id, latest_state.clone());
                }
            }
        }
        updates
    }

    pub fn flush_dirty_telemetry(&mut self) -> HashMap<String, crate::core::messages::DeviceTelemetry> {
        let mut updates = HashMap::with_capacity(self.dirty_telemetry.len());
        for device_id in self.dirty_telemetry.drain() {
            if let Some(tel) = self.telemetry.get(&device_id) {
                updates.insert(device_id, tel.clone());
            }
        }
        updates
    }

    pub fn evaluate_virtual_tags(&mut self) {
        if self.virtual_tags.is_empty() {
            return;
        }

        let mut new_updates = Vec::new();
        
        for vtag in &self.virtual_tags {
            if !vtag.config.enabled {
                continue;
            }
            let mut needs_eval = false;
            for source_tag_id in vtag.config.sources.values() {
                if self.dirty_tags.contains(source_tag_id) {
                    needs_eval = true;
                    break;
                }
            }
            
            if !needs_eval {
                continue;
            }

            let mut context = evalexpr::HashMapContext::new();
            let mut all_sources_available = true;

            for (var_name, source_tag_id) in &vtag.config.sources {
                if let Some(history) = self.tag_history.get(source_tag_id) {
                    if let Some(state) = history.back() {
                        let eval_val = match &state.value {
                            crate::core::messages::TagValue::Integer(v) => evalexpr::Value::Int(*v),
                            crate::core::messages::TagValue::Float(v) => evalexpr::Value::Float(*v),
                            crate::core::messages::TagValue::String(v) => evalexpr::Value::String(v.clone()),
                            crate::core::messages::TagValue::Raw(_) => {
                                all_sources_available = false;
                                break;
                            }
                        };
                        let _ = context.set_value(var_name.clone(), eval_val);
                    } else {
                        all_sources_available = false;
                        break;
                    }
                } else {
                    all_sources_available = false;
                    break;
                }
            }

            if all_sources_available {
                match vtag.ast.eval_with_context(&context) {
                    Ok(result) => {
                        let tag_value = match result {
                            evalexpr::Value::Int(v) => crate::core::messages::TagValue::Integer(v),
                            evalexpr::Value::Float(v) => crate::core::messages::TagValue::Float(v),
                            evalexpr::Value::String(v) => crate::core::messages::TagValue::String(v),
                            evalexpr::Value::Boolean(b) => crate::core::messages::TagValue::Integer(if b { 1 } else { 0 }),
                            _ => continue, // Unsupported result type
                        };
                        
                        let timestamp_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;

                        new_updates.push(HubMessage::UpdateTag {
                            connection_id: "virtual".to_string(),
                            device_id: "virtual".to_string(),
                            state: crate::core::messages::TagState {
                                tag_id: vtag.config.id.clone(),
                                value: tag_value,
                                quality: crate::core::messages::TagQuality::Good,
                                timestamp_ms,
                            }
                        });
                    }
                    Err(e) => {
                        error!("Error evaluating virtual tag '{}': {}", vtag.config.id, e);
                    }
                }
            }
        }

        // Process the new updates so they go into history and dirty_tags
        for msg in new_updates {
            self.process_message(msg);
        }
    }
}

pub async fn run_data_hub_manager(
    mut hub: DataHub,
    mut receiver: mpsc::Receiver<HubMessage>,
    app_handle: Option<AppHandle>,
    ui_throttle_ms: u64,
) {
    let mut flush_interval = interval(Duration::from_millis(ui_throttle_ms));

    let emit_if_status = |msg: &HubMessage, app_handle: &Option<AppHandle>| {
        if let HubMessage::ConnectionStatus {
            connection_id,
            is_connected,
            error,
        } = msg
        {
            if let Some(app) = app_handle {
                let event = crate::protocol::ipc::ConnectionStatusEvent {
                    connection_id: connection_id.clone(),
                    is_connected: *is_connected,
                    error: error.clone(),
                };
                if let Err(e) = app.emit("connection-status", event) {
                    error!("Failed to emit connection-status event: {}", e);
                }
            }
        }
    };

    loop {
        tokio::select! {
            // Task 2.3: Batch draining using try_recv
            Some(msg) = receiver.recv() => {
                emit_if_status(&msg, &app_handle);
                hub.process_message(msg);

                // Drain any other immediately available messages in the queue
                while let Ok(msg) = receiver.try_recv() {
                    emit_if_status(&msg, &app_handle);
                    hub.process_message(msg);
                }
            }

            _ = flush_interval.tick() => {
                hub.evaluate_virtual_tags();
                
                let tags = hub.flush_dirty_tags();
                if !tags.is_empty() {
                    if let Some(app) = &app_handle {
                        let event = TagsUpdatedEvent { tags };
                        if let Err(e) = app.emit("tags-updated", event) {
                            error!("Failed to emit tags-updated event: {}", e);
                        }
                    }
                }

                let telemetry = hub.flush_dirty_telemetry();
                if !telemetry.is_empty() {
                    if let Some(app) = &app_handle {
                        let event = crate::protocol::ipc::TelemetryUpdatedEvent { telemetry };
                        if let Err(e) = app.emit("telemetry-updated", event) {
                            error!("Failed to emit telemetry-updated event: {}", e);
                        }
                    }
                }


            }

            else => {
                info!("Data hub receiver channel closed. Shutting down manager.");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::messages::{TagQuality, TagValue};

    #[test]
    fn test_ring_buffer_limit() {
        let mut hub = DataHub::new();
        let tag_id = "sensor_1".to_string();

        // Push 10_005 messages (5 over the limit of 10,000)
        for i in 0..10_005 {
            hub.process_message(HubMessage::UpdateTag {
                connection_id: "conn_1".to_string(),
                device_id: "dev_1".to_string(),
                state: TagState {
                    tag_id: tag_id.clone(),
                    value: TagValue::Integer(i),
                    quality: TagQuality::Good,
                    timestamp_ms: i as u64,
                },
            });
        }

        let history = hub.tag_history.get(&tag_id).unwrap();
        assert_eq!(history.len(), RING_BUFFER_SIZE);

        // The first element should be the 5th message (value 5), since 0-4 were dropped
        if let TagValue::Integer(val) = history.front().unwrap().value {
            assert_eq!(val, 5);
        } else {
            panic!("Wrong value type");
        }
    }
}
