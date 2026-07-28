use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;

use tauri_app_lib::core::data_hub::DataHub;
use tauri_app_lib::core::messages::HubMessage;
use tauri_app_lib::core::plugin_registry::PluginRegistry;
use tauri_app_lib::workspace::session::{ConnectionConfig, ConnectionType, WorkspaceSession};

#[tokio::test]
async fn test_headless_integration_mock_worker() {
    // 1. Create a session with a Mock Connection
    let session = WorkspaceSession {
        session_id: "headless_integration_1".to_string(),
        ui_throttle_ms: 100, // Not strictly used by this headless test since we observe the raw bus
        connections: vec![ConnectionConfig {
            connection_id: "mock_conn_1".to_string(),
            connection_type: ConnectionType::Mock, // We use Mock variant to spawn MockProtocolWorker
            polling_interval_ms: 50,
            devices: vec![tauri_app_lib::workspace::session::DeviceInstance {
                instance_id: "mock_device_1".to_string(),
                profile_id: "mock_profile_1".to_string(),
                connection_id: "mock_conn_1".to_string(),
                slave_id: 1,
            }],
        }],
        profiles: vec![tauri_app_lib::workspace::session::DeviceProfile {
            profile_id: "mock_profile_1".to_string(),
            name: "Mock Profile".to_string(),
            tags: vec![tauri_app_lib::workspace::session::TagConfig {
                tag_id: "mock_conn_1_mock_tag_1".to_string(),
                name: None,
                unit: None,
                register_type: tauri_app_lib::workspace::session::RegisterType::Holding,
                address: 0,
                bit_offset: None,
                data_type: tauri_app_lib::workspace::session::DataType::Float32,
                byte_order: None,
                scale: None,
            }],
        }],
    };

    // 2. Start the Data Hub
    let (hub_tx, hub_rx) = mpsc::channel(1024);
    let hub = DataHub::new();
    let mut event_rx = hub.event_bus.subscribe();

    tokio::spawn(async move {
        tauri_app_lib::core::data_hub::run_data_hub_manager(hub, hub_rx, None, 100).await;
    });

    // 3. Start the Plugin Registry and load the session
    let mut registry = PluginRegistry::new(hub_tx.clone());

    // In our registry, loading the session automatically starts the workers.
    registry
        .load_workspace(&session)
        .await
        .expect("Failed to load workspace");

    // 4. Verify data starts flowing on the event bus
    let mut received_tags = 0;

    // We expect the mock worker to generate tags periodically (every 50ms)
    // Let's wait for at least 3 tags within a 1 second timeout.
    let wait_result = timeout(Duration::from_secs(1), async {
        loop {
            match event_rx.recv().await {
                Ok(HubMessage::UpdateTag {
                    connection_id,
                    state,
                    ..
                }) => {
                    assert_eq!(connection_id, "mock_conn_1");
                    assert!(state.tag_id.starts_with("mock_conn_1"));
                    received_tags += 1;
                    if received_tags >= 3 {
                        break;
                    }
                }
                Ok(HubMessage::ConnectionStatus { .. }) => {
                    // Ignore status updates
                }
                _ => {}
            }
        }
    })
    .await;

    // 5. Cleanup
    registry.stop_all().await.expect("Failed to stop workers");

    // Drop channels to stop the Data Hub gracefully
    drop(hub_tx);
    drop(event_rx);

    // Wait for the hub manager task to exit
    // Note: since run_data_hub_manager is a blocking loop on the receiver, it might not exit immediately
    // unless we also abort it, but dropping hub_tx should cause recv() to return None.

    assert!(
        wait_result.is_ok(),
        "Timed out waiting for mock data on the event bus"
    );
    assert_eq!(received_tags, 3);
}
