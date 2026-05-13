use std::path::PathBuf;

/// Resolve the directory that holds run.bat, .env, emails.txt, proxies.txt,
/// accounts.csv, accounts-failed.csv, dumps/. Resolution order:
///   1. $WALLY_TARGET_DIR if set and exists
///   2. directory containing the current exe (production: dropped into me\)
///   3. C:\WalmartGen\me  (dev fallback so `npm run tauri dev` just works)
pub fn target_dir() -> PathBuf {
    if let Ok(env) = std::env::var("WALLY_TARGET_DIR") {
        let p = PathBuf::from(env);
        if p.join("run.bat").is_file() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("run.bat").is_file() {
                return dir.to_path_buf();
            }
        }
    }
    PathBuf::from(r"C:\WalmartGen\me")
}
