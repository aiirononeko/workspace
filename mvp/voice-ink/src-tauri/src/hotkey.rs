// Global hotkey module
// Registers and handles system-wide keyboard shortcuts using rdev (Windows only)
// On non-Windows platforms, provides a stub implementation that loops indefinitely.

use anyhow::Result;
use log::{info, warn};

#[cfg(windows)]
use anyhow::bail;
#[cfg(windows)]
use log::{debug, error};
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::Arc;

/// Represents a modifier key that must be held for the hotkey combo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modifier {
    Ctrl,
    Shift,
    Alt,
    Meta,
}

/// Represents the trigger key (non-modifier) for the hotkey combo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerKey {
    Space,
    Key(char),
}

/// Global hotkey manager that listens for a key combination and fires callbacks
/// when the hotkey is pressed and released.
pub struct HotkeyManager {
    modifiers: Vec<Modifier>,
    trigger: TriggerKey,
}

impl HotkeyManager {
    /// Create a new HotkeyManager from a hotkey string like "ctrl+shift+space".
    ///
    /// Supported modifiers: ctrl, shift, alt, meta/super/win
    /// Supported trigger keys: space, a-z, 0-9
    pub fn new(hotkey_str: &str) -> Self {
        let (modifiers, trigger) = parse_hotkey(hotkey_str);
        info!(
            "HotkeyManager created: modifiers={:?}, trigger={:?}",
            modifiers, trigger
        );
        Self { modifiers, trigger }
    }

    /// Start listening for global key events. This method blocks the calling thread.
    ///
    /// - `on_press` is called once when the full hotkey combo is activated (all modifiers held + trigger pressed).
    /// - `on_release` is called once when the trigger key is released while the combo was active.
    ///
    /// On Windows, this uses `rdev::listen` for true global hotkey capture.
    /// On non-Windows, this is a stub that parks the thread indefinitely.
    pub fn start_listening<F1, F2>(self, on_press: F1, on_release: F2) -> Result<()>
    where
        F1: Fn() + Send + 'static,
        F2: Fn() + Send + 'static,
    {
        #[cfg(windows)]
        {
            self.start_listening_windows(on_press, on_release)
        }
        #[cfg(not(windows))]
        {
            self.start_listening_stub(on_press, on_release)
        }
    }

    /// Windows implementation using rdev::listen.
    #[cfg(windows)]
    fn start_listening_windows<F1, F2>(self, on_press: F1, on_release: F2) -> Result<()>
    where
        F1: Fn() + Send + 'static,
        F2: Fn() + Send + 'static,
    {
        use rdev::{listen, Event, EventType, Key};

        let modifiers = self.modifiers;
        let trigger = self.trigger;

        // Track which modifier keys are currently held down.
        let ctrl_held = Arc::new(AtomicBool::new(false));
        let shift_held = Arc::new(AtomicBool::new(false));
        let alt_held = Arc::new(AtomicBool::new(false));
        let meta_held = Arc::new(AtomicBool::new(false));

        // Track whether the hotkey combo is currently active (to prevent repeated on_press calls).
        let active = Arc::new(AtomicBool::new(false));

        let ctrl_held_c = ctrl_held.clone();
        let shift_held_c = shift_held.clone();
        let alt_held_c = alt_held.clone();
        let meta_held_c = meta_held.clone();
        let active_c = active.clone();

        let callback = move |event: Event| {
            match event.event_type {
                EventType::KeyPress(key) => {
                    // Update modifier state
                    update_modifier_state(
                        &key,
                        true,
                        &ctrl_held_c,
                        &shift_held_c,
                        &alt_held_c,
                        &meta_held_c,
                    );

                    // Check if this is the trigger key
                    if is_trigger_key(&key, &trigger) {
                        // Check if all required modifiers are held
                        let all_modifiers_held = check_modifiers(
                            &modifiers,
                            &ctrl_held_c,
                            &shift_held_c,
                            &alt_held_c,
                            &meta_held_c,
                        );

                        if all_modifiers_held && !active_c.load(Ordering::SeqCst) {
                            active_c.store(true, Ordering::SeqCst);
                            debug!("Hotkey pressed - activating");
                            on_press();
                        }
                    }
                }
                EventType::KeyRelease(key) => {
                    // Update modifier state
                    update_modifier_state(
                        &key,
                        false,
                        &ctrl_held_c,
                        &shift_held_c,
                        &alt_held_c,
                        &meta_held_c,
                    );

                    // If the trigger key was released while active, fire on_release
                    if is_trigger_key(&key, &trigger) && active_c.load(Ordering::SeqCst) {
                        active_c.store(false, Ordering::SeqCst);
                        debug!("Hotkey released - deactivating");
                        on_release();
                    }
                }
                _ => {}
            }
        };

        info!("Starting rdev global key listener");
        if let Err(e) = listen(callback) {
            error!("rdev listen error: {:?}", e);
            bail!("Failed to start global key listener: {:?}", e);
        }

        Ok(())
    }

    /// Stub implementation for non-Windows platforms.
    /// Simply parks the thread so the caller blocks without consuming CPU.
    #[cfg(not(windows))]
    fn start_listening_stub<F1, F2>(self, _on_press: F1, _on_release: F2) -> Result<()>
    where
        F1: Fn() + Send + 'static,
        F2: Fn() + Send + 'static,
    {
        warn!("Global hotkey listening is not supported on this platform (non-Windows)");
        warn!("Hotkey thread will park indefinitely. Use Tauri commands or UI for recording.");
        loop {
            std::thread::park();
        }
    }
}

// ---------------------------------------------------------------------------
// Hotkey string parsing
// ---------------------------------------------------------------------------

/// Parse a hotkey string like "ctrl+shift+space" into modifiers and a trigger key.
/// The last component is treated as the trigger key, everything else as modifiers.
fn parse_hotkey(hotkey_str: &str) -> (Vec<Modifier>, TriggerKey) {
    let parts: Vec<String> = hotkey_str
        .split('+')
        .map(|s| s.trim().to_lowercase())
        .collect();

    if parts.is_empty() {
        warn!("Empty hotkey string, defaulting to Space");
        return (vec![], TriggerKey::Space);
    }

    let mut modifiers = Vec::new();
    let mut trigger = TriggerKey::Space;

    for (i, part) in parts.iter().enumerate() {
        let is_last = i == parts.len() - 1;

        match part.as_str() {
            "ctrl" | "control" if !is_last => modifiers.push(Modifier::Ctrl),
            "shift" if !is_last => modifiers.push(Modifier::Shift),
            "alt" if !is_last => modifiers.push(Modifier::Alt),
            "meta" | "super" | "win" | "cmd" if !is_last => modifiers.push(Modifier::Meta),
            // Last part is the trigger key
            _ if is_last => {
                trigger = match part.as_str() {
                    "space" => TriggerKey::Space,
                    s if s.len() == 1 => {
                        // Safe: we just checked s.len() == 1, so .next() always returns Some
                        TriggerKey::Key(s.chars().next().unwrap_or(' '))
                    }
                    other => {
                        warn!("Unknown trigger key '{}', defaulting to Space", other);
                        TriggerKey::Space
                    }
                };
            }
            // Non-last part that isn't a recognized modifier - treat as modifier best-effort
            other => {
                warn!("Unknown modifier '{}', ignoring", other);
            }
        }
    }

    (modifiers, trigger)
}

// ---------------------------------------------------------------------------
// rdev helpers (Windows only)
// ---------------------------------------------------------------------------

/// Update the held state for modifier keys.
#[cfg(windows)]
fn update_modifier_state(
    key: &rdev::Key,
    pressed: bool,
    ctrl: &AtomicBool,
    shift: &AtomicBool,
    alt: &AtomicBool,
    meta: &AtomicBool,
) {
    use rdev::Key;
    match key {
        Key::ControlLeft | Key::ControlRight => ctrl.store(pressed, Ordering::SeqCst),
        Key::ShiftLeft | Key::ShiftRight => shift.store(pressed, Ordering::SeqCst),
        Key::Alt | Key::AltGr => alt.store(pressed, Ordering::SeqCst),
        Key::MetaLeft | Key::MetaRight => meta.store(pressed, Ordering::SeqCst),
        _ => {}
    }
}

/// Check if all required modifiers are currently held.
#[cfg(windows)]
fn check_modifiers(
    required: &[Modifier],
    ctrl: &AtomicBool,
    shift: &AtomicBool,
    alt: &AtomicBool,
    meta: &AtomicBool,
) -> bool {
    for m in required {
        let held = match m {
            Modifier::Ctrl => ctrl.load(Ordering::SeqCst),
            Modifier::Shift => shift.load(Ordering::SeqCst),
            Modifier::Alt => alt.load(Ordering::SeqCst),
            Modifier::Meta => meta.load(Ordering::SeqCst),
        };
        if !held {
            return false;
        }
    }
    true
}

/// Check if a given rdev key matches the configured trigger key.
#[cfg(windows)]
fn is_trigger_key(key: &rdev::Key, trigger: &TriggerKey) -> bool {
    use rdev::Key;
    match trigger {
        TriggerKey::Space => matches!(key, Key::Space),
        TriggerKey::Key(c) => match c {
            'a' => matches!(key, Key::KeyA),
            'b' => matches!(key, Key::KeyB),
            'c' => matches!(key, Key::KeyC),
            'd' => matches!(key, Key::KeyD),
            'e' => matches!(key, Key::KeyE),
            'f' => matches!(key, Key::KeyF),
            'g' => matches!(key, Key::KeyG),
            'h' => matches!(key, Key::KeyH),
            'i' => matches!(key, Key::KeyI),
            'j' => matches!(key, Key::KeyJ),
            'k' => matches!(key, Key::KeyK),
            'l' => matches!(key, Key::KeyL),
            'm' => matches!(key, Key::KeyM),
            'n' => matches!(key, Key::KeyN),
            'o' => matches!(key, Key::KeyO),
            'p' => matches!(key, Key::KeyP),
            'q' => matches!(key, Key::KeyQ),
            'r' => matches!(key, Key::KeyR),
            's' => matches!(key, Key::KeyS),
            't' => matches!(key, Key::KeyT),
            'u' => matches!(key, Key::KeyU),
            'v' => matches!(key, Key::KeyV),
            'w' => matches!(key, Key::KeyW),
            'x' => matches!(key, Key::KeyX),
            'y' => matches!(key, Key::KeyY),
            'z' => matches!(key, Key::KeyZ),
            '0' => matches!(key, Key::Num0),
            '1' => matches!(key, Key::Num1),
            '2' => matches!(key, Key::Num2),
            '3' => matches!(key, Key::Num3),
            '4' => matches!(key, Key::Num4),
            '5' => matches!(key, Key::Num5),
            '6' => matches!(key, Key::Num6),
            '7' => matches!(key, Key::Num7),
            '8' => matches!(key, Key::Num8),
            '9' => matches!(key, Key::Num9),
            _ => false,
        },
    }
}
