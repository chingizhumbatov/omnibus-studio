pub mod core;
pub mod plugins;
pub mod protocol;
pub mod state;
pub mod workspace;

use crate::core::messages::{HubMessage, TagState, TagValue};
use crate::workspace::session::WorkspaceSession;
use state::{AppState, SnifferState};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{mpsc, oneshot, Mutex};

/// Запрос на запись значения в тег со стороны UI
#[tauri::command]
async fn write_tag(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    device_id: String,
    tag_id: String,
    value: TagValue,
) -> Result<(), String> {
    let registry = state.registry.lock().await;
    registry
        .write_tag(&connection_id, &device_id, &tag_id, value)
        .await
        .map_err(|e| format!("Failed to write tag: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn reset_telemetry(
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<(), String> {
    let _ = state.hub_sender.send(HubMessage::ResetTelemetry { device_id }).await;
    Ok(())
}

#[tauri::command]
async fn load_workspace(
    state: tauri::State<'_, AppState>,
    session: WorkspaceSession,
) -> Result<(), String> {
    let mut registry = state.registry.lock().await;
    registry
        .load_workspace(&session)
        .await
        .map_err(|e| format!("Failed to load workspace: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn stop_workspace(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut registry = state.registry.lock().await;
    registry
        .stop_all()
        .await
        .map_err(|e| format!("Failed to stop workspace: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn save_session(app: tauri::AppHandle, session: WorkspaceSession) -> Result<(), String> {
    let manager = crate::workspace::manager::WorkspaceManager::new(&app);
    manager.save_session(&session).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<WorkspaceSession, String> {
    let manager = crate::workspace::manager::WorkspaceManager::new(&app);
    manager.load_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_sessions(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let manager = crate::workspace::manager::WorkspaceManager::new(&app);
    manager.list_sessions().map_err(|e| e.to_string())
}

/// Request the full tag history snapshot from the Data Hub ring buffer.
/// Uses a oneshot channel for the request-response pattern without shared state.
#[tauri::command]
async fn get_tag_history(
    state: tauri::State<'_, AppState>,
    tag_id: String,
) -> Result<Vec<TagState>, String> {
    let (tx, rx) = oneshot::channel();
    state
        .hub_sender
        .send(HubMessage::QueryHistory {
            tag_id,
            responder: tx,
        })
        .await
        .map_err(|e| format!("Failed to send QueryHistory to hub: {}", e))?;

    rx.await
        .map_err(|e| format!("DataHub did not respond to QueryHistory: {}", e))
}

#[tauri::command]
async fn connect_channel(
    state: tauri::State<'_, AppState>,
    config: crate::workspace::session::ConnectionConfig,
    profiles: Vec<crate::workspace::session::DeviceProfile>,
) -> Result<(), String> {
    let mut registry = state.registry.lock().await;
    registry
        .connect_channel(config, profiles)
        .await
        .map_err(|e| format!("Failed to connect channel: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn disconnect_channel(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<(), String> {
    let mut registry = state.registry.lock().await;
    registry
        .disconnect_channel(&connection_id)
        .await
        .map_err(|e| format!("Failed to disconnect channel: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn apply_virtual_tags(
    state: tauri::State<'_, AppState>,
    tags: Vec<crate::workspace::session::VirtualTagConfig>,
) -> Result<(), String> {
    let _ = state.hub_sender.send(crate::core::messages::HubMessage::ApplyVirtualTags { tags }).await;
    Ok(())
}

#[tauri::command]
async fn get_available_ports() -> Result<Vec<String>, String> {
    match tokio_serial::available_ports() {
        Ok(ports) => Ok(ports.into_iter().map(|p| p.port_name).collect()),
        Err(e) => Err(format!("Failed to enumerate serial ports: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (tx, rx) = mpsc::channel(1024);
            
            let hub = crate::core::data_hub::DataHub::new();
            let sniffer_bus = hub.sniffer_bus.clone();

            let registry = Arc::new(Mutex::new(
                crate::core::plugin_registry::PluginRegistry::new(tx.clone(), sniffer_bus.clone()),
            ));

            app.manage(AppState {
                hub_sender: tx.clone(),
                registry,
                sniffer_bus,
            });
            
            app.manage(SnifferState {
                task_handle: Arc::new(Mutex::new(None)),
            });
            
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                // Run data hub manager
                crate::core::data_hub::run_data_hub_manager(hub, rx, Some(app_handle), 100).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            write_tag,
            load_workspace,
            stop_workspace,
            get_tag_history,
            save_session,
            load_session,
            list_sessions,
            connect_channel,
            disconnect_channel,
            apply_virtual_tags,
            get_available_ports,
            reset_telemetry,
            crate::core::sniffer_manager::start_sniffer,
            crate::core::sniffer_manager::stop_sniffer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
