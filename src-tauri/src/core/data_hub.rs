use std::collections::{HashMap, HashSet, VecDeque};
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, mpsc};
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};

use super::messages::{HubMessage, TagState};
use crate::protocol::ipc::TagsUpdatedEvent;

const RING_BUFFER_SIZE: usize = 10_000;

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

    /// Buffer for sniffer packets captured between UI flushes
    sniffer_buffer: Vec<crate::protocol::ipc::SnifferFrame>,

    /// Broadcast channel for out-of-tree plugins, sniffer, and AI integrations.
    /// Every incoming message is cloned and sent out to all active subscribers.
    pub event_bus: broadcast::Sender<HubMessage>,
}

impl Default for DataHub {
    fn default() -> Self {
        Self::new()
    }
}

impl DataHub {
    pub fn new() -> Self {
        let (event_bus, _) = broadcast::channel(1024);
        Self {
            tag_history: HashMap::new(),
            port_statuses: HashMap::new(),
            dirty_tags: HashSet::new(),
            telemetry: HashMap::new(),
            dirty_telemetry: HashSet::new(),
            sniffer_buffer: Vec::new(),
            event_bus,
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
            HubMessage::ProtocolTrace {
                ref connection_id,
                ref direction,
                ref payload,
                ref timestamp_ms,
            } => {
                let _ = self.event_bus.send(msg.clone());
                self.sniffer_buffer.push(crate::protocol::ipc::SnifferFrame {
                    connection_id: connection_id.clone(),
                    direction: direction.clone(),
                    payload: payload.clone(),
                    timestamp_ms: *timestamp_ms,
                });
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

    pub fn flush_sniffer_buffer(&mut self) -> Vec<crate::protocol::ipc::SnifferFrame> {
        let frames = self.sniffer_buffer.clone();
        self.sniffer_buffer.clear();
        frames
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

                let frames = hub.flush_sniffer_buffer();
                if !frames.is_empty() {
                    if let Some(app) = &app_handle {
                        let event = crate::protocol::ipc::SnifferUpdatedEvent { frames };
                        if let Err(e) = app.emit("sniffer-updated", event) {
                            error!("Failed to emit sniffer-updated event: {}", e);
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
