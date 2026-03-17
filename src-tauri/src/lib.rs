use tauri::Manager;
use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use std::fs;
use std::path::Path;

#[derive(serde::Serialize, Clone)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<DirEntry>>,
}

fn read_dir_recursive(path: &Path, depth: usize, max_depth: usize) -> Vec<DirEntry> {
    let mut entries: Vec<DirEntry> = Vec::new();
    if let Ok(read_dir) = fs::read_dir(path) {
        for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let entry_path = entry.path();
            let is_dir = entry_path.is_dir();
            let children = if is_dir && depth < max_depth {
                Some(read_dir_recursive(&entry_path, depth + 1, max_depth))
            } else {
                None
            };
            entries.push(DirEntry { name, path: entry_path.to_string_lossy().to_string(), is_dir, children });
        }
        entries.sort_by(|a, b| {
            if a.is_dir && !b.is_dir { std::cmp::Ordering::Less }
            else if !a.is_dir && b.is_dir { std::cmp::Ordering::Greater }
            else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) }
        });
    }
    entries
}

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

            // Build native menu bar
            build_menu(app)?;

            // In release mode, show connect page or go directly to server
            #[cfg(not(debug_assertions))]
            {
                if let Ok(server_url) = std::env::var("EXIDE_SERVER") {
                    if let Some(window) = app.get_webview_window("main") {
                        let url: tauri::Url = server_url.parse().expect("Invalid EXIDE_SERVER URL");
                        let _ = window.navigate(url);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    let app_menu = SubmenuBuilder::new(handle, "eXide Desktop")
        .item(&PredefinedMenuItem::about(handle, None, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("preferences", "Preferences...").accelerator("CmdOrCtrl+,").build(handle)?)
        .separator()
        .item(&PredefinedMenuItem::hide(handle, None)?)
        .item(&PredefinedMenuItem::hide_others(handle, None)?)
        .item(&PredefinedMenuItem::show_all(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(handle, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&MenuItemBuilder::with_id("new-xquery", "New XQuery").accelerator("CmdOrCtrl+N").build(handle)?)
        .item(&MenuItemBuilder::with_id("new", "New...").accelerator("CmdOrCtrl+Shift+N").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open", "Open...").accelerator("CmdOrCtrl+Shift+O").build(handle)?)
        .item(&MenuItemBuilder::with_id("open-local", "Open Local Folder...").build(handle)?)
        .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+Shift+S").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("close-doc", "Close Document").accelerator("CmdOrCtrl+W").build(handle)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&PredefinedMenuItem::undo(handle, None)?)
        .item(&PredefinedMenuItem::redo(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(handle, None)?)
        .item(&PredefinedMenuItem::copy(handle, None)?)
        .item(&PredefinedMenuItem::paste(handle, None)?)
        .item(&PredefinedMenuItem::select_all(handle, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("find", "Find...").accelerator("CmdOrCtrl+F").build(handle)?)
        .item(&MenuItemBuilder::with_id("replace", "Find & Replace...").accelerator("CmdOrCtrl+Shift+F").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("format", "Format Code").accelerator("CmdOrCtrl+Shift+P").build(handle)?)
        .item(&MenuItemBuilder::with_id("toggle-comment", "Toggle Comment").accelerator("CmdOrCtrl+Shift+C").build(handle)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&MenuItemBuilder::with_id("toggle-collections", "Toggle Collections").build(handle)?)
        .item(&MenuItemBuilder::with_id("toggle-results", "Toggle Results").build(handle)?)
        .item(&MenuItemBuilder::with_id("toggle-dark-mode", "Toggle Dark Mode").build(handle)?)
        .build()?;

    let navigate_menu = SubmenuBuilder::new(handle, "Navigate")
        .item(&MenuItemBuilder::with_id("command-palette", "Command Palette").accelerator("CmdOrCtrl+Shift+K").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("goto-definition", "Go to Definition").accelerator("F3").build(handle)?)
        .item(&MenuItemBuilder::with_id("find-references", "Find All References").accelerator("Shift+F3").build(handle)?)
        .item(&MenuItemBuilder::with_id("goto-symbol", "Go to Symbol").accelerator("CmdOrCtrl+Shift+U").build(handle)?)
        .item(&MenuItemBuilder::with_id("goto-line", "Go to Line").accelerator("CmdOrCtrl+L").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::with_id("function-doc", "Function Documentation").accelerator("F1").build(handle)?)
        .item(&MenuItemBuilder::with_id("diagnostics", "Toggle Diagnostics").accelerator("CmdOrCtrl+Shift+D").build(handle)?)
        .build()?;

    let run_menu = SubmenuBuilder::new(handle, "Run")
        .item(&MenuItemBuilder::with_id("run-query", "Run Query").accelerator("CmdOrCtrl+Return").build(handle)?)
        .item(&MenuItemBuilder::with_id("run-app", "Launch Application").accelerator("CmdOrCtrl+Shift+Return").build(handle)?)
        .build()?;

    let xquery_menu = SubmenuBuilder::new(handle, "XQuery")
        .item(&MenuItemBuilder::with_id("expand-selection", "Expand Selection").accelerator("Ctrl+CmdOrCtrl+Up").build(handle)?)
        .item(&MenuItemBuilder::with_id("rename-symbol", "Rename Symbol").accelerator("Ctrl+CmdOrCtrl+R").build(handle)?)
        .item(&MenuItemBuilder::with_id("extract-function", "Extract Function").accelerator("CmdOrCtrl+Ctrl+X").build(handle)?)
        .item(&MenuItemBuilder::with_id("extract-variable", "Extract Variable").accelerator("CmdOrCtrl+Ctrl+E").build(handle)?)
        .build()?;

    let exist_app_menu = SubmenuBuilder::new(handle, "App")
        .item(&MenuItemBuilder::with_id("deploy", "Deploy").build(handle)?)
        .item(&MenuItemBuilder::with_id("download", "Download").build(handle)?)
        .item(&MenuItemBuilder::with_id("synchronize", "Synchronize").accelerator("CmdOrCtrl+Alt+S").build(handle)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(handle, "Window")
        .item(&PredefinedMenuItem::minimize(handle, None)?)
        .item(&PredefinedMenuItem::maximize(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(handle, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("next-tab", "Next Tab").accelerator("Ctrl+Alt+Right").build(handle)?)
        .item(&MenuItemBuilder::with_id("prev-tab", "Previous Tab").accelerator("Ctrl+Alt+Left").build(handle)?)
        .build()?;

    let help_menu = SubmenuBuilder::new(handle, "Help")
        .item(&MenuItemBuilder::with_id("keyboard-shortcuts", "Keyboard Shortcuts").build(handle)?)
        .item(&MenuItemBuilder::with_id("about-exide", "About eXide").build(handle)?)
        .build()?;

    let menu = Menu::with_items(handle, &[
        &app_menu, &file_menu, &edit_menu, &view_menu, &navigate_menu,
        &run_menu, &xquery_menu, &exist_app_menu, &window_menu, &help_menu,
    ])?;

    app.set_menu(menu)?;

    app.on_menu_event(move |app_handle, event| {
        let id = event.id().0.as_str();

        // Special handling: Open Local Folder uses Rust-side dialog + file I/O
        if id == "open-local" {
            let app_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_dialog::DialogExt;
                let folder = app_handle.dialog().file()
                    .set_title("Open Project Folder")
                    .blocking_pick_folder();
                if let Some(path) = folder {
                    let path_str = path.to_string();
                    // Read directory tree (3 levels deep) and pass as JSON
                    let entries = read_dir_recursive(Path::new(&path_str), 0, 3);
                    let entries_json = serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string());

                    if let Some(window) = app_handle.get_webview_window("main") {
                        let script = format!(
                            "{}; if(window.__exideLocalFiles) window.__exideLocalFiles.openFolderWithData('{}', {});",
                            include_str!("../local-files.js"),
                            path_str.replace('\\', "\\\\").replace('\'', "\\'"),
                            entries_json
                        );
                        let _ = window.eval(&script);
                    }
                }
            });
            return;
        }

        let js = match id {
            "new" => "document.getElementById('new').click()",
            "new-xquery" => "document.getElementById('new-xquery').click()",
            "open" => "eXide.app.openDocument()",
            "save" => "eXide.app.saveDocument()",
            "close-doc" => "eXide.app.closeDocument()",
            "preferences" => "eXide.app.showPreferences()",
            "find" => "eXide.app.getEditor().editor.dispatch({});CM6.openSearchPanel(eXide.app.getEditor().editor)",
            "replace" => "eXide.app.getEditor().search.open()",
            "format" => "eXide.app.getEditor().exec('format')",
            "toggle-comment" => "CM6.toggleComment(eXide.app.getEditor().editor)",
            "toggle-collections" => "eXide.app.toggleCollectionsPanel()",
            "toggle-results" => "eXide.app.toggleResultsPanel()",
            "toggle-dark-mode" => "document.getElementById('toggle-dark-mode').click()",
            "command-palette" => "eXide.app.getMenu().commandPalette()",
            "goto-definition" => "eXide.app.getEditor().exec('gotoDefinition')",
            "find-references" => "eXide.app.getEditor().exec('findReferences')",
            "goto-symbol" => "eXide.app.getEditor().exec('gotoSymbol')",
            "goto-line" => "eXide.app.getEditor().gotoLine()",
            "function-doc" => "eXide.app.getEditor().exec('showFunctionDoc')",
            "diagnostics" => "eXide.app.getEditor().toggleDiagnostics()",
            "run-query" => "eXide.app.runQuery()",
            "run-app" => "eXide.app.runApp()",
            "expand-selection" => "eXide.app.getEditor().exec('expandSelection')",
            "rename-symbol" => "eXide.app.getEditor().exec('rename')",
            "extract-function" => "eXide.app.getEditor().exec('extractFunction')",
            "extract-variable" => "eXide.app.getEditor().exec('extractVariable')",
            "deploy" => "eXide.app.deployApp()",
            "download" => "eXide.app.downloadApp()",
            "synchronize" => "eXide.app.synchronize()",
            "next-tab" => "eXide.app.getEditor().nextTab()",
            "prev-tab" => "eXide.app.getEditor().previousTab()",
            "keyboard-shortcuts" => "eXide.app.showKeyboardHelp()",
            "about-exide" => "eXide.app.showAbout()",
            _ => return,
        };

        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.eval(js);
        }
    });

    Ok(())
}
