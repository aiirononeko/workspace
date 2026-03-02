// LLM text formatting module
// Post-processes transcribed text using LLM for proper formatting

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

const SYSTEM_PROMPT: &str = "\
あなたは日本語音声入力の整形器です。以下のルールに厳密に従ってください：

1. 入力テキストの意味を一切変えないこと
2. フィラーワード（えーと、あの、そのー、えー、あー、まあ、なんか、こう、ええと）を削除
3. 固有名詞、数値、URL、英単語、コード記号はそのまま保持
4. 適切な句読点（。、）を補完
5. 明らかな言い直し・繰り返しは最終的な表現のみ残す
6. 推測で情報を補完しない。聞き取れない語はそのまま残す
7. 出力は整形後のテキストのみ。説明や前置きは一切不要";

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL: &str = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 4096;

// --- Request types ---

#[derive(Serialize)]
struct MessagesRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<Message>,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

// --- Response types ---

#[derive(Deserialize)]
struct MessagesResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
}

#[derive(Deserialize)]
struct ApiError {
    error: ApiErrorDetail,
}

#[derive(Deserialize)]
struct ApiErrorDetail {
    message: String,
}

/// Trait for text formatting engines.
pub trait TextFormatter {
    fn format(&self, raw_text: &str) -> Result<String>;
}

/// Claude API implementation of `TextFormatter`.
pub struct ClaudeFormatter {
    api_key: String,
    client: Client,
}

impl ClaudeFormatter {
    /// Create a new `ClaudeFormatter` instance.
    ///
    /// # Arguments
    /// * `api_key` - Anthropic API key for authentication
    pub fn new(api_key: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .context("Failed to build HTTP client")?;
        Ok(Self { api_key, client })
    }
}

impl TextFormatter for ClaudeFormatter {
    /// Format raw transcribed text using the Claude API.
    ///
    /// Sends the raw text to Claude with a system prompt that instructs it
    /// to clean up filler words, add punctuation, and remove repetitions
    /// while preserving the original meaning.
    ///
    /// # Arguments
    /// * `raw_text` - Raw transcribed text from speech recognition
    ///
    /// # Returns
    /// The formatted text on success.
    fn format(&self, raw_text: &str) -> Result<String> {
        let request_body = MessagesRequest {
            model: CLAUDE_MODEL.to_string(),
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT.to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: raw_text.to_string(),
            }],
        };

        let response = self
            .client
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&request_body)
            .send()
            .context("Failed to send request to Claude API")?;

        let status = response.status();

        if status.is_success() {
            let body: MessagesResponse = response
                .json()
                .context("Failed to parse Claude API response")?;

            let text = body
                .content
                .into_iter()
                .filter_map(|block| match block {
                    ContentBlock::Text { text } => Some(text),
                })
                .collect::<Vec<_>>()
                .join("");

            if text.is_empty() {
                Err(anyhow!("Claude API returned empty response"))
            } else {
                Ok(text)
            }
        } else {
            let error_body = response
                .text()
                .unwrap_or_else(|_| "Unable to read error body".to_string());

            // Try to parse structured error
            let detail = serde_json::from_str::<ApiError>(&error_body)
                .map(|e| e.error.message)
                .unwrap_or_else(|_| error_body);

            match status.as_u16() {
                401 => Err(anyhow!(
                    "Authentication failed: invalid Anthropic API key. Details: {}",
                    detail
                )),
                429 => Err(anyhow!(
                    "Rate limit exceeded. Please retry later. Details: {}",
                    detail
                )),
                400 => Err(anyhow!("Bad request to Claude API: {}", detail)),
                _ => Err(anyhow!(
                    "Claude API returned HTTP {}: {}",
                    status.as_u16(),
                    detail
                )),
            }
        }
    }
}
