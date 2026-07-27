use std::collections::{HashMap, HashSet};
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

use super::messages::{HubMessage, Payload};

/// The central in-memory state repository (Tag Dictionary).
/// Holds the latest known values and statuses of all tags and devices.
pub struct DataHub {
    /// Maps a unique tag identifier to its latest raw byte payload.
    tags: HashMap<String, Payload>,
    
    /// Maps a device identifier to its current fault state (if any).
    /// 'None' in a real system would imply the device is operating normally.
    device_faults: HashMap<String, u8>,
    
    /// Tracks the status of physical ports.
    port_statuses: HashMap<String, bool>,

    /// Internal set of tags that have been updated since the last UI emission.
    /// Used for interval-based batching to prevent React UI starvation.
    dirty_tags: HashSet<String>,
}

impl DataHub {
    /// Creates a new, empty DataHub.
    pub fn new() -> Self {
        Self {
            tags: HashMap::new(),
            device_faults: HashMap::new(),
            port_statuses: HashMap::new(),
            dirty_tags: HashSet::new(),
        }
    }

    /// Processes an incoming HubMessage and mutates the state safely without locks.
    pub fn process_message(&mut self, msg: HubMessage) {
        match msg {
            HubMessage::UpdateTag { tag_id, raw_payload } => {
                self.tags.insert(tag_id.clone(), raw_payload);
                self.dirty_tags.insert(tag_id);
                // Note: If the device was previously faulted, we could clear the fault here
                // since we successfully received new data.
            }
            HubMessage::DeviceFault { device_id, error_code } => {
                self.device_faults.insert(device_id, error_code);
            }
            HubMessage::PortStatusChange { port_id, is_open } => {
                self.port_statuses.insert(port_id, is_open);
            }
        }
    }

    /// Flushes the accumulated changes for UI emission.
    /// Returns a list of updated tags and clears the dirty set.
    pub fn flush_dirty_tags(&mut self) -> Vec<(String, Payload)> {
        let mut updates = Vec::with_capacity(self.dirty_tags.len());
        for tag_id in self.dirty_tags.drain() {
            if let Some(payload) = self.tags.get(&tag_id) {
                updates.push((tag_id, payload.clone()));
            }
        }
        updates
    }
}

/// The main entry point for the Single Consumer manager task.
/// It listens to the `mpsc` receiver, mutates the Data Hub, and flushes updates periodically.
pub async fn run_data_hub_manager(mut receiver: mpsc::Receiver<HubMessage>) {
    let mut hub = DataHub::new();
    
    // Throttled UI emission interval (100ms = 10 FPS on the frontend)
    let mut flush_interval = interval(Duration::from_millis(100));

    // Tokio select! allows us to await multiple asynchronous conditions concurrently.
    loop {
        tokio::select! {
            // 1. Process incoming messages from connection workers (Producers)
            Some(msg) = receiver.recv() => {
                hub.process_message(msg);
            }
            
            // 2. Periodically flush batched updates to the Tauri IPC Bridge
            _ = flush_interval.tick() => {
                let updates = hub.flush_dirty_tags();
                if !updates.is_empty() {
                    // TODO: Connect this to Tauri's Event Broadcaster
                    // app_handle.emit_all("tags-updated", updates).unwrap();
                    println!("Flushing {} updated tags to UI...", updates.len());
                }
            }
            
            // 3. Handle channel closure (graceful shutdown)
            else => {
                println!("Data hub receiver channel closed. Shutting down manager.");
                break;
            }
        }
    }
}
