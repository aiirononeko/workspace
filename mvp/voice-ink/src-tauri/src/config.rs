use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub openai_api_key: String,
    pub anthropic_api_key: String,
    pub hotkey: String,
    pub language: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            hotkey: "ctrl+shift+space".to_string(),
            language: "ja".to_string(),
        }
    }
}

impl AppConfig {
    pub fn config_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;
        let app_dir = config_dir.join("voice-ink");
        fs::create_dir_all(&app_dir)?;
        Ok(app_dir.join("config.json"))
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;
        if path.exists() {
            let content = fs::read_to_string(&path)?;
            let config: AppConfig = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            let config = AppConfig::default();
            config.save()?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path()?;
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }

    pub fn is_configured(&self) -> bool {
        !self.openai_api_key.is_empty() && !self.anthropic_api_key.is_empty()
    }
}
