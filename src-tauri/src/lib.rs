use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In release mode, show the connection page first.
            // If EXIDE_SERVER is set, skip the connection page and go directly.
            #[cfg(not(debug_assertions))]
            {
                if let Ok(server_url) = std::env::var("EXIDE_SERVER") {
                    if let Some(window) = app.get_webview_window("main") {
                        let url: tauri::Url = server_url.parse().expect("Invalid EXIDE_SERVER URL");
                        let _ = window.navigate(url);
                    }
                }
                // Otherwise, the bundled connect.html loads as the default frontendDist page
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
