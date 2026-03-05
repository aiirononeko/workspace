use crate::config::{self, AppConfig};
use tauri::AppHandle;

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    config::save(&app, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    config::load(&app).map_err(|e| e.to_string())
}
