use tauri::Manager;

mod commands;
mod config;
mod pipeline;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Global shortcut
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                let handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["alt+space"])?
                        .with_handler(move |_app, _shortcut, event| match event.state() {
                            ShortcutState::Pressed => {
                                println!("[shortcut] Alt+Space Pressed");
                                let h = handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    pipeline::on_shortcut_pressed(&h).await;
                                });
                            }
                            ShortcutState::Released => {
                                println!("[shortcut] Alt+Space Released");
                                let h = handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    pipeline::on_shortcut_released(&h).await;
                                });
                            }
                        })
                        .build(),
                )?;
            }

            // System tray
            #[cfg(desktop)]
            tray::setup(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_config,
            commands::load_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
