use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In release mode, load eXide from the configured eXist-db server
            // instead of bundled assets (eXide requires a server backend).
            #[cfg(not(debug_assertions))]
            {
                let server_url = std::env::var("EXIDE_SERVER")
                    .unwrap_or_else(|_| "http://localhost:8080/exist/apps/eXide".to_string());

                if let Some(window) = app.get_webview_window("main") {
                    let url: tauri::Url = server_url.parse().expect("Invalid server URL");
                    let _ = window.navigate(url);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
