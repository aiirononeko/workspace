// Automatic Speech Recognition module
// Handles communication with Whisper API for transcription

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use reqwest::blocking::multipart::{Form, Part};

/// Trait for speech-to-text engines.
pub trait AsrEngine {
    fn transcribe(&self, wav_data: Vec<u8>) -> Result<String>;
}

/// OpenAI Whisper API implementation of `AsrEngine`.
pub struct WhisperApi {
    api_key: String,
    language: String,
    client: Client,
}

impl WhisperApi {
    /// Create a new `WhisperApi` instance.
    ///
    /// # Arguments
    /// * `api_key` - OpenAI API key for authentication
    /// * `language` - Language code for transcription (e.g. "ja", "en")
    pub fn new(api_key: String, language: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Failed to build HTTP client")?;
        Ok(Self {
            api_key,
            language,
            client,
        })
    }
}

impl AsrEngine for WhisperApi {
    /// Transcribe WAV audio data to text using the OpenAI Whisper API.
    ///
    /// Sends the WAV data as a multipart/form-data request to the
    /// `https://api.openai.com/v1/audio/transcriptions` endpoint.
    ///
    /// # Arguments
    /// * `wav_data` - Raw WAV file bytes
    ///
    /// # Returns
    /// The transcribed text on success.
    fn transcribe(&self, wav_data: Vec<u8>) -> Result<String> {
        let file_part = Part::bytes(wav_data)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .context("Failed to set MIME type for audio part")?;

        let form = Form::new()
            .part("file", file_part)
            .text("model", "whisper-1")
            .text("language", self.language.clone())
            .text("response_format", "text");

        let response = self
            .client
            .post("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .context("Failed to send request to Whisper API")?;

        let status = response.status();

        if status.is_success() {
            let text = response
                .text()
                .context("Failed to read response body from Whisper API")?;
            Ok(text.trim().to_string())
        } else {
            let error_body = response
                .text()
                .unwrap_or_else(|_| "Unable to read error body".to_string());

            match status.as_u16() {
                401 => Err(anyhow!(
                    "Authentication failed: invalid API key. Details: {}",
                    error_body
                )),
                429 => Err(anyhow!(
                    "Rate limit exceeded. Please retry later. Details: {}",
                    error_body
                )),
                413 => Err(anyhow!(
                    "Audio file too large. Maximum size is 25 MB. Details: {}",
                    error_body
                )),
                _ => Err(anyhow!(
                    "Whisper API returned HTTP {}: {}",
                    status.as_u16(),
                    error_body
                )),
            }
        }
    }
}
