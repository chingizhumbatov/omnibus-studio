use crate::core::messages::HubMessage;
use tokio::sync::mpsc;

pub struct AppState {
    pub hub_sender: mpsc::Sender<HubMessage>,
    pub registry: std::sync::Arc<tokio::sync::Mutex<crate::core::plugin_registry::PluginRegistry>>,
}
