// Text insertion module
// Handles inserting formatted text into the active application
// Uses clipboard (arboard) and keyboard simulation (enigo) strategies

use anyhow::{Context, Result};
use log::warn;
use std::thread;
use std::time::Duration;

/// Trait for inserting text at the current caret position.
pub trait Inserter {
    fn insert_at_caret(&self, text: &str) -> Result<()>;
}

/// Inserts text by temporarily using the system clipboard and simulating Ctrl+V.
///
/// Strategy:
/// 1. Save current clipboard contents
/// 2. Set the desired text to clipboard
/// 3. Simulate Ctrl+V
/// 4. Restore original clipboard contents (best effort)
pub struct ClipboardInserter;

impl ClipboardInserter {
    pub fn new() -> Self {
        Self
    }
}

impl Inserter for ClipboardInserter {
    fn insert_at_caret(&self, text: &str) -> Result<()> {
        let mut clipboard =
            arboard::Clipboard::new().context("Failed to initialize clipboard")?;

        // Step 1: Save current clipboard content (may be empty or non-text)
        let original = clipboard.get_text().ok();

        // Step 2: Set the new text to clipboard
        clipboard
            .set_text(text)
            .context("Failed to set text to clipboard")?;

        // Step 3: Wait briefly for clipboard to settle
        thread::sleep(Duration::from_millis(50));

        // Step 4: Simulate Ctrl+V keypress
        let paste_result = simulate_paste();
        if let Err(e) = &paste_result {
            // Even if paste fails, try to restore clipboard before returning error
            restore_clipboard(&mut clipboard, original);
            return paste_result.with_context(|| format!("Failed to simulate paste: {}", e));
        }

        // Step 5: Wait for the paste to be processed by the target application
        thread::sleep(Duration::from_millis(100));

        // Step 6: Restore original clipboard content (best effort)
        restore_clipboard(&mut clipboard, original);

        Ok(())
    }
}

/// Simulate Ctrl+V keypress.
/// On Windows, uses enigo for keyboard simulation.
/// On other platforms, logs a warning (paste simulation not available).
fn simulate_paste() -> Result<()> {
    #[cfg(windows)]
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};

        let mut enigo = Enigo::new(&Settings::default())
            .map_err(|e| anyhow::anyhow!("Failed to create Enigo instance: {}", e))?;

        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| anyhow::anyhow!("Failed to press Ctrl: {}", e))?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| anyhow::anyhow!("Failed to press V: {}", e))?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| anyhow::anyhow!("Failed to release Ctrl: {}", e))?;

        Ok(())
    }

    #[cfg(not(windows))]
    {
        warn!("Keyboard simulation (Ctrl+V) is not available on this platform");
        warn!("Text has been set to clipboard. Please paste manually.");
        Ok(())
    }
}

/// Restore the original clipboard content. Logs a warning on failure but does not propagate errors.
fn restore_clipboard(clipboard: &mut arboard::Clipboard, original: Option<String>) {
    match original {
        Some(text) => {
            if let Err(e) = clipboard.set_text(&text) {
                warn!("Failed to restore original clipboard content: {}", e);
            }
        }
        None => {
            if let Err(e) = clipboard.clear() {
                warn!("Failed to clear clipboard during restore: {}", e);
            }
        }
    }
}
