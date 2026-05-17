use std::collections::HashMap;

use tauri::{AppHandle, State};

use crate::fsops;
use crate::run::RunState;
use crate::update;

#[tauri::command]
pub fn read_text_file(rel_path: String) -> Result<String, String> {
    fsops::read_text(&rel_path).map_err(|e| e.to_string())
}

/// Read an arbitrary absolute path — used when the user has picked a master
/// list .txt outside the target dir. Path comes from the dialog plugin's
/// file picker, so it's user-authorized.
#[tauri::command]
pub fn read_text_file_abs(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(rel_path: String, content: String) -> Result<(), String> {
    fsops::write_text(&rel_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_env() -> Result<Vec<fsops::EnvLine>, String> {
    fsops::read_env().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_env(values: HashMap<String, String>) -> Result<(), String> {
    fsops::write_env(&values).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autoclean_dumps(keep: usize) -> Result<usize, String> {
    fsops::autoclean_dumps(keep).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cap_failed_csv(keep: usize) -> Result<usize, String> {
    fsops::cap_failed_csv(keep).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_run(app: AppHandle, state: State<RunState>) -> Result<(), String> {
    crate::run::start(app, &state).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_run(app: AppHandle, state: State<RunState>) -> Result<(), String> {
    crate::run::stop(app, &state).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_running(state: State<RunState>) -> bool {
    crate::run::is_running(&state)
}

#[tauri::command]
pub async fn check_for_update() -> Result<update::UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(|| update::check().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn download_update(app: AppHandle, url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        update::download(app, url)
            .map(|p| p.display().to_string())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn apply_update_and_restart(app: AppHandle) -> Result<(), String> {
    update::apply_and_restart(app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_imap(user: String, pass: String, host: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::imap_test::ping(&user, &pass, &host).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
