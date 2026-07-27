use crate::core::messages::HubMessage;
use tokio::sync::mpsc;

pub struct AppState {
    pub hub_sender: mpsc::Sender<HubMessage>,
}
