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
            event_bus,
        }
    }

    pub fn process_message(&mut self, msg: HubMessage) {
        // Task 3.2: Broadcast to any listening plugins (ignore if no receivers)
        let _ = self.event_bus.send(msg.clone());

        match msg {
            HubMessage::UpdateTag { state, .. } => {
                let tag_id = state.tag_id.clone();
                let history = self.tag_history.entry(tag_id.clone()).or_default();

                if history.len() >= RING_BUFFER_SIZE {
                    history.pop_front();
                }
                history.push_back(state);
                self.dirty_tags.insert(tag_id);
            }
            HubMessage::ConnectionStatus {
                connection_id,
                is_connected,
                error: _,
            } => {
                self.port_statuses.insert(connection_id, is_connected);
            }
            HubMessage::WriteTag { .. } => {
                warn!("WriteTag received in DataHub but not implemented yet to route to worker");
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
}

pub async fn run_data_hub_manager(
    mut receiver: mpsc::Receiver<HubMessage>,
    app_handle: AppHandle,
    ui_throttle_ms: u64,
) {
    let mut hub = DataHub::new();
    let mut flush_interval = interval(Duration::from_millis(ui_throttle_ms));

    loop {
        tokio::select! {
            // Task 2.3: Batch draining using try_recv
            Some(msg) = receiver.recv() => {
                hub.process_message(msg);

                // Drain any other immediately available messages in the queue
                while let Ok(msg) = receiver.try_recv() {
                    hub.process_message(msg);
                }
            }

            _ = flush_interval.tick() => {
                let tags = hub.flush_dirty_tags();
                if !tags.is_empty() {
                    let event = TagsUpdatedEvent { tags };
                    if let Err(e) = app_handle.emit("tags-updated", event) {
                        error!("Failed to emit tags-updated event: {}", e);
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
