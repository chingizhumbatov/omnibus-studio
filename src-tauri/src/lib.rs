pub mod core;
pub mod plugins;
pub mod protocol;
pub mod state;
pub mod workspace;

use crate::core::messages::HubMessage;
use state::AppState;
use tauri::Manager;
use tokio::sync::mpsc;

/// Запрос на запись значения в тег со стороны UI
#[tauri::command]
async fn write_tag(
    state: tauri::State<'_, AppState>,
    tag_id: String,
    payload: Vec<u8>,
) -> Result<(), String> {
    state
        .hub_sender
        .send(HubMessage::UpdateTag {
            tag_id,
            raw_payload: payload,
        })
        .await
        .map_err(|e| format!("Failed to send to hub: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (tx, rx) = mpsc::channel(1024);

            // Register State
            app.manage(AppState { hub_sender: tx });

            let app_handle = app.handle().clone();

            // Spawn the Data Hub Manager task
            tauri::async_runtime::spawn(async move {
                crate::core::data_hub::run_data_hub_manager(rx, app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![write_tag])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
