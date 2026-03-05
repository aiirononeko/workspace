pub mod converter;
pub mod recorder;
pub mod transcriber;

use tauri::{AppHandle, Emitter};

fn emit_state(app: &AppHandle, state: &str) {
    let _ = app.emit("pipeline-state", state);
}

fn _emit_error(app: &AppHandle, phase: &str, message: &str) {
    let _ = app.emit(
        "pipeline-error",
        serde_json::json!({
            "phase": phase,
            "message": message,
        }),
    );
}

pub async fn on_shortcut_pressed(app: &AppHandle) {
    println!("[pipeline] Recording started");
    emit_state(app, "recording");
}

pub async fn on_shortcut_released(app: &AppHandle) {
    println!("[pipeline] Recording stopped");
    emit_state(app, "done");
}
