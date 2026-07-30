use crate::core::messages::{HubMessage, SnifferMessage};
use tokio::sync::{mpsc, broadcast, Mutex};
use std::sync::Arc;

pub struct AppState {
    pub hub_sender: mpsc::Sender<HubMessage>,
    pub registry: Arc<Mutex<crate::core::plugin_registry::PluginRegistry>>,
    pub sniffer_bus: broadcast::Sender<SnifferMessage>,
}

pub struct SnifferState {
    pub task_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}
