pub mod core;
pub mod plugins;
pub mod protocol;
pub mod state;
pub mod workspace;

use crate::core::messages::{HubMessage, TagValue};
use crate::workspace::session::WorkspaceSession;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{mpsc, Mutex};

/// Запрос на запись значения в тег со стороны UI
#[tauri::command]
async fn write_tag(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    device_id: String,
    tag_id: String,
    value: TagValue,
) -> Result<(), String> {
    state
        .hub_sender
        .send(HubMessage::WriteTag {
            connection_id,
            device_id,
            tag_id,
            value,
        })
        .await
        .map_err(|e| format!("Failed to send to hub: {}", e))?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (tx, rx) = mpsc::channel(1024);

            let registry = Arc::new(Mutex::new(
                crate::core::plugin_registry::PluginRegistry::new(tx.clone()),
            ));

            app.manage(AppState {
                hub_sender: tx.clone(),
                registry,
            });
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let hub = crate::core::data_hub::DataHub::new();
                // Run data hub manager
                crate::core::data_hub::run_data_hub_manager(hub, rx, Some(app_handle), 100).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            write_tag,
            load_workspace,
            stop_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
