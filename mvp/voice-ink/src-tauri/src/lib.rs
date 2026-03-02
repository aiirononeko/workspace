pub mod audio;
pub mod asr;
pub mod config;
pub mod formatter;
pub mod hotkey;
pub mod inserter;

use std::sync::{Arc, Mutex};

use asr::{AsrEngine, WhisperApi};
use audio::Recorder;
use formatter::{ClaudeFormatter, TextFormatter};
use inserter::{ClipboardInserter, Inserter};

/// Shared application state managed by Tauri.
struct AppState {
    recorder: Mutex<Option<Recorder>>,
}

// --- Tauri Commands ---

#[tauri::command]
fn get_config() -> Result<config::AppConfig, String> {
    config::AppConfig::load().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(config: config::AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_status() -> String {
    "ready".to_string()
}

/// Start recording audio from the microphone.
#[tauri::command]
fn start_recording(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut recorder_guard = state.recorder.lock().map_err(|e| e.to_string())?;

    let mut recorder = Recorder::new().map_err(|e| format!("Failed to create recorder: {}", e))?;
    recorder
        .start()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    *recorder_guard = Some(recorder);
    Ok(())
}

/// Stop recording and run the full pipeline: ASR → LLM formatting → text insertion.
#[tauri::command]
fn stop_recording_and_insert(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let config =
        config::AppConfig::load().map_err(|e| format!("Failed to load config: {}", e))?;

    if !config.is_configured() {
        return Err("APIキーが未設定です。設定画面からAPIキーを入力してください。".to_string());
    }

    // Stop recording and get WAV data
    let wav_data = {
        let mut recorder_guard = match state.recorder.lock() {
            Ok(guard) => guard,
            Err(e) => return Err(format!("Lock error: {}", e)),
        };
        match recorder_guard.as_mut() {
            Some(recorder) => {
                let wav = recorder
                    .stop_and_collect_wav()
                    .map_err(|e| format!("Failed to collect audio: {}", e))?;
                *recorder_guard = None;
                wav
            }
            None => return Err("録音が開始されていません。".to_string()),
        }
    };

    // ASR: WAV → text
    let whisper = WhisperApi::new(config.openai_api_key, config.language)
        .map_err(|e| format!("HTTPクライアントの初期化に失敗しました: {}", e))?;
    let raw_text = whisper
        .transcribe(wav_data)
        .map_err(|e| format!("音声認識に失敗しました: {}", e))?;

    if raw_text.is_empty() {
        return Err("音声が認識されませんでした。".to_string());
    }

    // LLM formatting
    let formatter = ClaudeFormatter::new(config.anthropic_api_key)
        .map_err(|e| format!("HTTPクライアントの初期化に失敗しました: {}", e))?;
    let formatted_text = formatter
        .format(&raw_text)
        .map_err(|e| format!("テキスト整形に失敗しました: {}", e))?;

    // Insert at caret
    let inserter = ClipboardInserter::new();
    inserter
        .insert_at_caret(&formatted_text)
        .map_err(|e| format!("テキスト挿入に失敗しました: {}", e))?;

    Ok(formatted_text)
}

// --- App Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        recorder: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_status,
            start_recording,
            stop_recording_and_insert,
        ])
        .setup(|_app| {
            // Spawn hotkey listener in a background thread
            std::thread::spawn(|| {
                let config = match config::AppConfig::load() {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("Failed to load config for hotkey: {}", e);
                        return;
                    }
                };

                let manager = hotkey::HotkeyManager::new(&config.hotkey);

                // Shared recorder for the hotkey pipeline
                let recorder: Arc<Mutex<Option<Recorder>>> = Arc::new(Mutex::new(None));
                let recorder_press = Arc::clone(&recorder);
                let recorder_release = Arc::clone(&recorder);

                let on_press = move || {
                    match Recorder::new() {
                        Ok(mut rec) => {
                            if let Err(e) = rec.start() {
                                eprintln!("Failed to start recording on hotkey: {}", e);
                                return;
                            }
                            match recorder_press.lock() {
                                Ok(mut guard) => {
                                    *guard = Some(rec);
                                    eprintln!("[VoiceInk] Recording started");
                                }
                                Err(e) => {
                                    eprintln!("Lock error: {}", e);
                                    return;
                                }
                            }
                        }
                        Err(e) => eprintln!("Failed to create recorder on hotkey: {}", e),
                    }
                };

                let on_release = move || {
                    let wav_data = {
                        match recorder_release.lock() {
                            Ok(mut guard) => {
                                match guard.as_mut() {
                                    Some(rec) => match rec.stop_and_collect_wav() {
                                        Ok(wav) => {
                                            *guard = None;
                                            wav
                                        }
                                        Err(e) => {
                                            eprintln!("Failed to collect audio: {}", e);
                                            *guard = None;
                                            return;
                                        }
                                    },
                                    None => {
                                        eprintln!("No active recording on hotkey release");
                                        return;
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("Lock error: {}", e);
                                return;
                            }
                        }
                    };

                    eprintln!("[VoiceInk] Recording stopped, processing...");

                    // Reload config on each release for fresh API keys/language
                    let current_config = match config::AppConfig::load() {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("Failed to reload config: {}", e);
                            return;
                        }
                    };

                    let openai_key = current_config.openai_api_key;
                    let anthropic_key = current_config.anthropic_api_key;
                    let language = current_config.language;

                    if openai_key.is_empty() || anthropic_key.is_empty() {
                        eprintln!("[VoiceInk] API keys not configured");
                        return;
                    }

                    std::thread::spawn(move || {
                        // ASR
                        let whisper = match WhisperApi::new(openai_key, language) {
                            Ok(w) => w,
                            Err(e) => {
                                eprintln!("Failed to create WhisperApi client: {}", e);
                                return;
                            }
                        };
                        let raw_text = match whisper.transcribe(wav_data) {
                            Ok(t) => t,
                            Err(e) => {
                                eprintln!("ASR failed: {}", e);
                                return;
                            }
                        };

                        if raw_text.is_empty() {
                            eprintln!("ASR returned empty text");
                            return;
                        }

                        eprintln!("[VoiceInk] ASR completed");

                        // LLM formatting
                        let fmt = match ClaudeFormatter::new(anthropic_key) {
                            Ok(f) => f,
                            Err(e) => {
                                eprintln!("Failed to create ClaudeFormatter client: {}", e);
                                return;
                            }
                        };
                        let formatted = match fmt.format(&raw_text) {
                            Ok(t) => t,
                            Err(e) => {
                                eprintln!("Formatting failed: {}", e);
                                raw_text // Fallback: use raw text if formatting fails
                            }
                        };

                        eprintln!("[VoiceInk] Formatting completed");

                        // Insert at caret
                        let ins = ClipboardInserter::new();
                        if let Err(e) = ins.insert_at_caret(&formatted) {
                            eprintln!("Text insertion failed: {}", e);
                        }

                        eprintln!("[VoiceInk] Text inserted successfully");
                    });
                };

                if let Err(e) = manager.start_listening(on_press, on_release) {
                    eprintln!("Hotkey listener failed: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("[VoiceInk] Fatal: failed to start application: {}", e);
            std::process::exit(1);
        });
}
