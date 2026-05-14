use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::paths;

/// Resolve a relative path against the target directory. Rejects anything that
/// escapes the target dir (no `..` traversal allowed).
fn resolve(rel: &str) -> Result<PathBuf> {
    let root = paths::target_dir();
    let candidate = root.join(rel);

    // Canonicalize parent so symlinks don't bypass the prefix check, but allow
    // the file itself to not yet exist (e.g. first write of accounts.csv).
    let parent = candidate
        .parent()
        .ok_or_else(|| anyhow!("path has no parent: {}", candidate.display()))?;
    if !parent.exists() {
        std::fs::create_dir_all(parent).with_context(|| format!("mkdir {}", parent.display()))?;
    }
    let parent_real = parent
        .canonicalize()
        .with_context(|| format!("canonicalize parent {}", parent.display()))?;
    let root_real = root
        .canonicalize()
        .with_context(|| format!("canonicalize target dir {}", root.display()))?;
    if !parent_real.starts_with(&root_real) {
        return Err(anyhow!(
            "path {} escapes target dir {}",
            candidate.display(),
            root_real.display()
        ));
    }
    let file_name = candidate
        .file_name()
        .ok_or_else(|| anyhow!("path has no file name: {}", candidate.display()))?;
    Ok(parent_real.join(file_name))
}

pub fn read_text(rel: &str) -> Result<String> {
    let path = resolve(rel)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))
}

pub fn write_text(rel: &str, content: &str) -> Result<()> {
    let path = resolve(rel)?;
    atomic_write(&path, content.as_bytes())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("bak")
    ));
    std::fs::write(&tmp, bytes).with_context(|| format!("write tmp {}", tmp.display()))?;
    std::fs::rename(&tmp, path)
        .with_context(|| format!("rename {} -> {}", tmp.display(), path.display()))
}

/// Prune `dumps/` down to the `keep` most-recent run subfolders, deleting the
/// rest. The engine writes each run into its own timestamped subdirectory
/// (`YYYYMMDD-HHMMSS`), so without this the folder grows without bound.
/// Returns the number of run folders removed.
pub fn autoclean_dumps(keep: usize) -> Result<usize> {
    let dumps = paths::target_dir().join("dumps");
    if !dumps.is_dir() {
        return Ok(0);
    }

    let mut runs: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(&dumps).with_context(|| format!("read {}", dumps.display()))? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Fall back to UNIX_EPOCH (oldest) if mtime is unreadable, so a
        // metadata hiccup makes the folder a deletion candidate rather than
        // shielding it forever.
        let mtime = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        runs.push((mtime, path));
    }

    // Most-recent first; everything past `keep` gets removed.
    runs.sort_by(|a, b| b.0.cmp(&a.0));
    let mut removed = 0;
    for (_, path) in runs.into_iter().skip(keep) {
        std::fs::remove_dir_all(&path).with_context(|| format!("remove {}", path.display()))?;
        removed += 1;
    }
    Ok(removed)
}

/// Read `.env` as an ordered list of (key, value, comment-or-blank) entries so
/// the editor can round-trip without losing comments or order.
pub fn read_env() -> Result<Vec<EnvLine>> {
    let raw = read_text(".env")?;
    let mut out = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            out.push(EnvLine::Raw(line.to_string()));
            continue;
        }
        if let Some(eq) = line.find('=') {
            let key = line[..eq].trim().to_string();
            let value = line[eq + 1..].to_string();
            out.push(EnvLine::Kv { key, value });
        } else {
            out.push(EnvLine::Raw(line.to_string()));
        }
    }
    Ok(out)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EnvLine {
    Raw(String),
    Kv { key: String, value: String },
}

/// Apply incoming `values` to the current .env, preserving comments + order.
/// Keys not present in the file get appended at the end.
pub fn write_env(values: &std::collections::HashMap<String, String>) -> Result<()> {
    let existing = read_env().unwrap_or_default();
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let mut out = String::new();

    for entry in &existing {
        match entry {
            EnvLine::Raw(line) => {
                out.push_str(line);
                out.push('\n');
            }
            EnvLine::Kv { key, value } => {
                let new = values.get(key).cloned().unwrap_or_else(|| value.clone());
                out.push_str(key);
                out.push('=');
                out.push_str(&new);
                out.push('\n');
                seen.insert(key.as_str());
            }
        }
    }

    let mut new_keys: Vec<_> = values.keys().filter(|k| !seen.contains(k.as_str())).collect();
    new_keys.sort();
    if !new_keys.is_empty() {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        for k in new_keys {
            out.push_str(k);
            out.push('=');
            out.push_str(&values[k]);
            out.push('\n');
        }
    }

    write_text(".env", &out)
}
