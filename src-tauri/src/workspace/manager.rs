use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::session::WorkspaceSession;
use crate::core::error::{CoreError, Result};

pub struct WorkspaceManager {
    workspaces_dir: PathBuf,
}

impl WorkspaceManager {
    pub fn new(app_handle: &AppHandle) -> Self {
        // Fallback to local ./workspaces directory if app_config_dir fails
        let app_dir = app_handle
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| PathBuf::from("."));

        let workspaces_dir = app_dir.join("workspaces");
        if !workspaces_dir.exists() {
            let _ = fs::create_dir_all(&workspaces_dir);
        }

        Self { workspaces_dir }
    }

    pub fn save_session(&self, session: &WorkspaceSession) -> Result<()> {
        let path = self
            .workspaces_dir
            .join(format!("{}.json", session.session_id));
        let data = serde_json::to_string_pretty(session)
            .map_err(|e| CoreError::ParsingError(e.to_string()))?;

        fs::write(path, data)
            .map_err(|e| CoreError::ParsingError(format!("Failed to write config: {}", e)))?;
        Ok(())
    }

    pub fn load_session(&self, session_id: &str) -> Result<WorkspaceSession> {
        let path = self.workspaces_dir.join(format!("{}.json", session_id));
        let data = fs::read_to_string(path)
            .map_err(|e| CoreError::ParsingError(format!("Failed to read config: {}", e)))?;

        let session: WorkspaceSession =
            serde_json::from_str(&data).map_err(|e| CoreError::ParsingError(e.to_string()))?;
        Ok(session)
    }

    pub fn list_sessions(&self) -> Result<Vec<String>> {
        let mut sessions = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.workspaces_dir) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "json" {
                        if let Some(name) = entry.path().file_stem() {
                            sessions.push(name.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        Ok(sessions)
    }
}
