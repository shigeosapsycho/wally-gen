use std::collections::HashMap;

use tauri::{AppHandle, State};

use crate::fsops;
use crate::run::RunState;

#[tauri::command]
pub fn read_text_file(rel_path: String) -> Result<String, String> {
    fsops::read_text(&rel_path).map_err(|e| e.to_string())
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
