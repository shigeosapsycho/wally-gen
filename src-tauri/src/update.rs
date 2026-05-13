//! Self-update for the portable wally-gen.exe.
//!
//! GitHub Releases is the artifact host. Each release tagged `vX.Y.Z`
//! must attach a `wally-gen.exe` asset built from that tag.
//!
//! Update lifecycle on Windows:
//!   1. `check`            queries the GitHub API for the latest release
//!                         and compares the tag to `CARGO_PKG_VERSION`.
//!   2. `download`         streams the new exe to `wally-gen.exe.new`
//!                         next to the current exe.
//!   3. `apply_and_restart` renames the running exe to `.old`, renames
//!                         `.new` into its place, spawns it, and exits.
//!                         Windows tolerates renaming a running exe.
//!   4. `cleanup_after_update` runs on the next startup and deletes
//!                         `wally-gen.exe.old`.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const GITHUB_REPO: &str = "shigeosapsycho/wally-gen";
const ASSET_NAME: &str = "wally-gen.exe";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub is_newer: bool,
    pub download_url: String,
    pub size: u64,
    pub release_notes: String,
    pub published_at: String,
}

#[derive(Deserialize)]
struct ReleaseJson {
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    published_at: String,
    #[serde(default)]
    assets: Vec<AssetJson>,
}

#[derive(Deserialize)]
struct AssetJson {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub fn check() -> Result<UpdateInfo> {
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(15))
        .build();
    let resp = match agent
        .get(&url)
        .set("User-Agent", "wally-gen-updater")
        .set("Accept", "application/vnd.github+json")
        .call()
    {
        Ok(r) => r,
        // Repo has no releases yet — surface as "up to date" rather than an
        // error so the banner stays out of the way before the first release.
        Err(ureq::Error::Status(404, _)) => return Ok(no_release_info()),
        Err(e) => return Err(anyhow::Error::from(e).context(format!("query {url}"))),
    };

    let release: ReleaseJson = resp.into_json().context("parse release JSON")?;

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let is_newer = is_strictly_newer(&latest, CURRENT_VERSION);

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case(ASSET_NAME))
        .ok_or_else(|| anyhow!("release {} has no {} asset", release.tag_name, ASSET_NAME))?;

    Ok(UpdateInfo {
        current: CURRENT_VERSION.to_string(),
        latest,
        is_newer,
        download_url: asset.browser_download_url.clone(),
        size: asset.size,
        release_notes: release.body,
        published_at: release.published_at,
    })
}

fn no_release_info() -> UpdateInfo {
    UpdateInfo {
        current: CURRENT_VERSION.to_string(),
        latest: CURRENT_VERSION.to_string(),
        is_newer: false,
        download_url: String::new(),
        size: 0,
        release_notes: String::new(),
        published_at: String::new(),
    }
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
    downloaded: u64,
    total: u64,
}

pub fn download(app: AppHandle, url: String) -> Result<PathBuf> {
    let exe = std::env::current_exe().context("current_exe")?;
    let dir = exe.parent().context("exe parent")?;
    let target = dir.join("wally-gen.exe.new");
    // Wipe any previous half-finished staging so we never resume garbage.
    let _ = std::fs::remove_file(&target);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(60))
        .build();
    let resp = agent
        .get(&url)
        .set("User-Agent", "wally-gen-updater")
        .call()
        .with_context(|| format!("download {url}"))?;

    let total: u64 = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(&target)
        .with_context(|| format!("create {}", target.display()))?;
    let mut buf = vec![0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    loop {
        let n = reader.read(&mut buf).context("read chunk")?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).context("write chunk")?;
        downloaded += n as u64;
        // Coalesce progress events to ~30/sec max so we don't flood the
        // renderer with `emit` calls on fast connections.
        if last_emit.elapsed() >= Duration::from_millis(33) {
            let _ = app.emit("update-progress", ProgressEvent { downloaded, total });
            last_emit = std::time::Instant::now();
        }
    }
    let _ = app.emit("update-progress", ProgressEvent { downloaded, total });
    file.sync_all().context("fsync")?;

    if total > 0 && downloaded != total {
        let _ = std::fs::remove_file(&target);
        return Err(anyhow!(
            "short download: got {downloaded} bytes, expected {total}"
        ));
    }
    Ok(target)
}

pub fn apply_and_restart() -> Result<()> {
    let exe = std::env::current_exe().context("current_exe")?;
    let dir = exe.parent().context("exe parent")?;
    let new_exe = dir.join("wally-gen.exe.new");
    let old_exe = dir.join("wally-gen.exe.old");

    if !new_exe.is_file() {
        return Err(anyhow!("no staged update at {}", new_exe.display()));
    }

    // Wipe any leftover from a prior swap; Windows won't let us reuse the
    // name if it's already taken.
    let _ = std::fs::remove_file(&old_exe);

    // Windows allows renaming a running exe, so the swap is just two
    // renames + spawn. The OS keeps our handle to the .old file alive
    // until our process exits a few lines below.
    std::fs::rename(&exe, &old_exe).with_context(|| {
        format!("rename {} -> {}", exe.display(), old_exe.display())
    })?;
    if let Err(e) = std::fs::rename(&new_exe, &exe) {
        // Roll back so we don't leave the user with no exe in place.
        let _ = std::fs::rename(&old_exe, &exe);
        return Err(anyhow::Error::from(e).context("rename .new -> current"));
    }

    std::process::Command::new(&exe)
        .spawn()
        .context("relaunch updated exe")?;

    // Bypass any pending Tauri shutdown choreography — we want to be out
    // of the file's way as fast as possible.
    std::process::exit(0);
}

/// Deletes the `.old` exe left behind by a self-update. Returns true if a
/// `.old` was found, which the caller interprets as "we just upgraded".
pub fn cleanup_after_update() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let Some(dir) = exe.parent() else { return false };
    let old = dir.join("wally-gen.exe.old");
    if !old.is_file() {
        return false;
    }
    let _ = std::fs::remove_file(&old);
    true
}

/// Compare two `MAJOR.MINOR.PATCH` strings numerically. Falls back to a
/// lexical compare for non-numeric components (so `1.0.0-rc1` still
/// compares sensibly against `1.0.0`).
fn is_strictly_newer(latest: &str, current: &str) -> bool {
    fn parts(v: &str) -> Vec<i64> {
        v.split(|c: char| c == '.' || c == '-' || c == '+')
            .map(|s| s.parse::<i64>().unwrap_or(-1))
            .collect()
    }
    let l = parts(latest);
    let c = parts(current);
    for i in 0..l.len().max(c.len()) {
        let lv = l.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if lv != cv {
            return lv > cv;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::is_strictly_newer;
    #[test]
    fn semver_compare() {
        assert!(is_strictly_newer("1.2.0", "1.1.0"));
        assert!(is_strictly_newer("1.10.0", "1.9.0"));
        assert!(!is_strictly_newer("1.0.0", "1.0.0"));
        assert!(!is_strictly_newer("1.0.0", "1.0.1"));
        assert!(is_strictly_newer("2.0.0", "1.99.99"));
    }
}
