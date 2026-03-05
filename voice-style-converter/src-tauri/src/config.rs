use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub openai_api_key: String,
    pub anthropic_api_key: String,
    pub shortcut: String,
    pub tone_mode: String,
    pub audio_device_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            shortcut: "alt+space".into(),
            tone_mode: "auto".into(),
            audio_device_id: None,
        }
    }
}

pub fn load(app: &AppHandle) -> Result<AppConfig> {
    let store = app.store("config.json")?;
    let config = store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(config)
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<()> {
    let store = app.store("config.json")?;
    store.set("config", serde_json::to_value(config)?);
    store.save()?;
    Ok(())
}
