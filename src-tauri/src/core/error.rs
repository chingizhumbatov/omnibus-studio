use serde::{Serialize, Serializer};
use thiserror::Error;

/// Centralized error type for the Rust core.
/// This enum strictly eliminates the need for `panic!()` and `.unwrap()`.
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Configuration parsing error: {0}")]
    Config(#[from] serde_json::Error),

    #[error("Connection failed on port {port}: {reason}")]
    ConnectionFault { port: String, reason: String },

    #[error("Device timeout (Slave ID: {slave_id}) on {connection_id}")]
    DeviceTimeout { slave_id: u8, connection_id: String },

    #[error("IPC bridge error: {0}")]
    Ipc(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Parsing error: {0}")]
    ParsingError(String),
}

// Allows CoreError to be returned directly from Tauri Commands (Invoke) to the Frontend.
// It converts the error enum into a simple string for the React UI to display.
impl Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

/// A specialized Result type for the Omnibus Studio core.
pub type Result<T> = std::result::Result<T, CoreError>;
