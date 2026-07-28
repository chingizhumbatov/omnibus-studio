pub mod core;
pub mod plugins;
pub mod protocol;
pub mod state;
pub mod workspace;

use crate::core::messages::{HubMessage, TagValue};
use state::AppState;
use tauri::Manager;
use tokio::sync::mpsc;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (tx, rx) = mpsc::channel(1024);

            app.manage(AppState {
                hub_sender: tx.clone(),
            });
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let hub = crate::core::data_hub::DataHub::new();

                // Spawn the plugin registry
                let mut registry = crate::core::plugin_registry::PluginRegistry::new(tx.clone());

                // Create a dummy session with a mock worker
                let session = crate::workspace::session::WorkspaceSession {
                    session_id: "demo_session".to_string(),
                    ui_throttle_ms: 100,
                    connections: vec![crate::workspace::session::ConnectionConfig {
                        connection_id: "mock_demo".to_string(),
                        connection_type: crate::workspace::session::ConnectionType::Tcp {
                            ip: "127.0.0.1".to_string(),
                            port: 502,
                        },
                        polling_interval_ms: 100,
                        devices: vec![],
                    }],
                };

                let _ = registry.load_workspace(&session).await;

                // Run data hub manager
                crate::core::data_hub::run_data_hub_manager(hub, rx, Some(app_handle), 100).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![write_tag])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
