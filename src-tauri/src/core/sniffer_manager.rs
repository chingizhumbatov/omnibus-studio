use tauri::{AppHandle, Emitter, State};
use crate::state::{AppState, SnifferState};
use crate::core::messages::{SnifferMessage, TrafficDirection};
use crate::protocol::ipc::{SnifferFrame, SnifferUpdatedEvent};
use tokio::time::{interval, Duration};

#[tauri::command]
pub async fn start_sniffer(
    app: AppHandle,
    app_state: State<'_, AppState>,
    sniffer_state: State<'_, SnifferState>,
) -> Result<(), String> {
    let mut handle_lock = sniffer_state.task_handle.lock().await;
    
    // If already running, do nothing
    if handle_lock.is_some() {
        return Ok(());
    }
    
    let mut receiver = app_state.sniffer_bus.subscribe();
    
    let handle = tokio::spawn(async move {
        let mut flush_interval = interval(Duration::from_millis(100)); // 100ms throttle
        let mut buffer = Vec::new();
        
        loop {
            tokio::select! {
                Ok(msg) = receiver.recv() => {
                    if let SnifferMessage::RawTraffic { port_id, direction, payload, timestamp_us } = msg {
                        let dir_str = match direction {
                            TrafficDirection::Tx => "tx".to_string(),
                            TrafficDirection::Rx => "rx".to_string(),
                        };
                        buffer.push(SnifferFrame {
                            connection_id: port_id,
                            direction: dir_str,
                            payload,
                            timestamp_us,
                        });
                    }
                }
                _ = flush_interval.tick() => {
                    if !buffer.is_empty() {
                        let frames = buffer.clone();
                        buffer.clear();
                        let event = SnifferUpdatedEvent { frames };
                        let _ = app.emit("sniffer-updated", event);
                    }
                }
            }
        }
    });
    
    *handle_lock = Some(handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_sniffer(
    sniffer_state: State<'_, SnifferState>,
) -> Result<(), String> {
    let mut handle_lock = sniffer_state.task_handle.lock().await;
    if let Some(handle) = handle_lock.take() {
        handle.abort();
    }
    Ok(())
}
