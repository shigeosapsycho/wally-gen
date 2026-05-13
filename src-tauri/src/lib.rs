mod commands;
mod fsops;
mod paths;
mod run;
mod update;

#[tauri::command]
fn target_dir() -> String {
    paths::target_dir().to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(run::RunState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = paths::target_dir();
            eprintln!("wally-gen target dir: {}", dir.display());
            // Clean up the .old exe left behind by a prior self-update.
            update::cleanup_after_update();
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            target_dir,
            commands::read_text_file,
            commands::write_text_file,
            commands::read_env,
            commands::write_env,
            commands::start_run,
            commands::stop_run,
            commands::is_running,
            commands::check_for_update,
            commands::download_update,
            commands::apply_update_and_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
