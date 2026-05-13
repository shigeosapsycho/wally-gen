use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use notify_debouncer_full::notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebouncedEvent};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::paths;

/// Singleton tracking the currently-running run.bat (if any).
pub struct RunState {
    inner: Mutex<Option<RunHandle>>,
}

impl RunState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }
}

struct RunHandle {
    child: Child,
    stopped: Arc<AtomicBool>,
}

#[derive(Serialize, Clone)]
struct LogEvent<'a> {
    line: &'a str,
    stream: &'static str,
}

#[derive(Serialize, Clone)]
struct StageEvent {
    email: String,
    stage: String,
}

#[derive(Serialize, Clone)]
struct DoneEvent {
    email: String,
    password: String,
    auth_code: String,
    identity_token: String,
    otp: String,
}

#[derive(Serialize, Clone)]
struct FailEvent {
    email: String,
    outcome: String,
    error_code: String,
    error_msg: String,
    ts: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    code: Option<i32>,
}

pub fn start(app: AppHandle, state: &RunState) -> Result<()> {
    let mut slot = state.inner.lock();
    if slot.as_mut().is_some_and(|h| is_alive(&mut h.child)) {
        return Err(anyhow!("a run is already in progress"));
    }
    *slot = None;

    let target = paths::target_dir();
    let bat = target.join("run.bat");
    if !bat.is_file() {
        return Err(anyhow!("run.bat not found at {}", bat.display()));
    }

    let mut cmd = Command::new("cmd.exe");
    cmd.arg("/c")
        .arg(&bat)
        .current_dir(&target)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: don't pop a console window when the GUI spawns it.
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().context("spawn run.bat")?;
    let stopped = Arc::new(AtomicBool::new(false));

    let stdout = child.stdout.take().context("stdout pipe missing")?;
    let stderr = child.stderr.take().context("stderr pipe missing")?;

    spawn_log_pump(app.clone(), BufReader::new(stdout), "stdout");
    spawn_log_pump(app.clone(), BufReader::new(stderr), "stderr");

    let app_for_watch = app.clone();
    let target_for_watch = target.clone();
    let stopped_for_watch = stopped.clone();
    std::thread::spawn(move || {
        if let Err(e) = run_watcher(app_for_watch.clone(), target_for_watch, stopped_for_watch) {
            let _ = app_for_watch.emit(
                "log",
                LogEvent { line: &format!("[watcher] error: {e}"), stream: "stderr" },
            );
        }
    });

    *slot = Some(RunHandle { child, stopped });

    Ok(())
}

pub fn stop(app: AppHandle, state: &RunState) -> Result<()> {
    let mut slot = state.inner.lock();
    if let Some(mut handle) = slot.take() {
        handle.stopped.store(true, Ordering::SeqCst);

        let pid = handle.child.id();
        let status = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Err(e) = status {
            let _ = app.emit(
                "log",
                LogEvent { line: &format!("[stop] taskkill failed: {e}"), stream: "stderr" },
            );
        }

        // Best-effort wait so child handles are released.
        let _ = handle.child.wait();
        let _ = app.emit("exit", ExitEvent { code: None });
    }
    Ok(())
}

pub fn is_running(state: &RunState) -> bool {
    let mut slot = state.inner.lock();
    let alive = slot.as_mut().is_some_and(|h| is_alive(&mut h.child));
    if !alive {
        *slot = None;
    }
    alive
}

fn is_alive(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn spawn_log_pump<R: Read + Send + 'static>(
    app: AppHandle,
    reader: BufReader<R>,
    stream: &'static str,
) {
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let _ = app.emit("log", LogEvent { line: &line, stream });
        }
    });
}

fn run_watcher(app: AppHandle, target: PathBuf, stopped: Arc<AtomicBool>) -> Result<()> {
    let accounts = target.join("accounts.csv");
    let failed = target.join("accounts-failed.csv");
    let dumps = target.join("dumps");

    // Tail offsets — start at current EOF so we only report rows produced by
    // the current run.
    let mut acc_off = file_len(&accounts);
    let mut fail_off = file_len(&failed);

    // Seen dump file names so we don't double-emit (notify can fire multiple
    // events per file).
    let mut seen_dumps: std::collections::HashSet<String> = std::collections::HashSet::new();

    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer =
        new_debouncer(Duration::from_millis(200), None, tx).context("create watcher")?;
    let watcher = debouncer.watcher();

    for p in [&accounts, &failed] {
        if let Some(parent) = p.parent() {
            let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
        }
    }
    if dumps.exists() {
        let _ = watcher.watch(&dumps, RecursiveMode::Recursive);
    } else if let Some(parent) = dumps.parent() {
        // dumps/ may not exist yet on first run; watch the parent so we pick it
        // up when it's created.
        let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
    }

    loop {
        if stopped.load(Ordering::SeqCst) {
            return Ok(());
        }
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(events)) => {
                for ev in events {
                    handle_event(
                        &app,
                        ev,
                        &accounts,
                        &failed,
                        &dumps,
                        &mut acc_off,
                        &mut fail_off,
                        &mut seen_dumps,
                    );
                }
            }
            Ok(Err(_errors)) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
        }
    }
}

fn handle_event(
    app: &AppHandle,
    ev: DebouncedEvent,
    accounts: &Path,
    failed: &Path,
    dumps: &Path,
    acc_off: &mut u64,
    fail_off: &mut u64,
    seen_dumps: &mut std::collections::HashSet<String>,
) {
    let touched_accounts = ev.event.paths.iter().any(|p| p == accounts);
    let touched_failed = ev.event.paths.iter().any(|p| p == failed);
    let touched_under_dumps = ev.event.paths.iter().any(|p| p.starts_with(dumps));

    if touched_accounts && matches!(ev.event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
        if let Ok(rows) = tail_csv(accounts, acc_off) {
            for row in rows {
                emit_account_row(app, &row, accounts);
            }
        }
    }
    if touched_failed && matches!(ev.event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
        if let Ok(rows) = tail_csv(failed, fail_off) {
            for row in rows {
                emit_failed_row(app, &row, failed);
            }
        }
    }
    if touched_under_dumps {
        for p in &ev.event.paths {
            if !p.starts_with(dumps) {
                continue;
            }
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
            if !name.ends_with(".json") {
                continue;
            }
            if seen_dumps.contains(name) {
                continue;
            }
            if let Some((email, stage)) = parse_dump_name(name) {
                seen_dumps.insert(name.to_string());
                let _ = app.emit("stage", StageEvent { email, stage });
            }
        }
    }
}

fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn tail_csv(path: &Path, offset: &mut u64) -> Result<Vec<Vec<String>>> {
    let mut f = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Ok(Vec::new()),
    };
    let len = f.metadata()?.len();
    if len < *offset {
        // File truncated/rotated — restart at zero.
        *offset = 0;
    }
    if len == *offset {
        return Ok(Vec::new());
    }
    f.seek(SeekFrom::Start(*offset))?;
    let mut buf = String::new();
    f.read_to_string(&mut buf).ok();
    *offset = len;

    let mut out = Vec::new();
    for line in buf.lines() {
        if line.trim().is_empty() {
            continue;
        }
        // Skip a header row if we happen to read from offset 0.
        if line.starts_with("email,") {
            continue;
        }
        out.push(parse_csv_row(line));
    }
    Ok(out)
}

/// Minimal RFC4180-ish CSV row parser. Matches the multitool implementation.
fn parse_csv_row(row: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = row.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else if c == ',' {
            out.push(std::mem::take(&mut field));
        } else if c == '"' && field.is_empty() {
            in_quotes = true;
        } else if c == '\r' {
            // skip
        } else {
            field.push(c);
        }
    }
    out.push(field);
    out
}

fn emit_account_row(app: &AppHandle, row: &[String], _path: &Path) {
    // header: email,password,authCode,identityToken,otp
    let get = |i: usize| row.get(i).cloned().unwrap_or_default();
    let email = get(0);
    if email.is_empty() {
        return;
    }
    let _ = app.emit(
        "done",
        DoneEvent {
            email,
            password: get(1),
            auth_code: get(2),
            identity_token: get(3),
            otp: get(4),
        },
    );
}

fn emit_failed_row(app: &AppHandle, row: &[String], _path: &Path) {
    // header: email,outcome,error_code,error_msg,ts
    let get = |i: usize| row.get(i).cloned().unwrap_or_default();
    let email = get(0);
    if email.is_empty() {
        return;
    }
    let _ = app.emit(
        "fail",
        FailEvent {
            email,
            outcome: get(1),
            error_code: get(2),
            error_msg: get(3),
            ts: get(4),
        },
    );
}

/// Parse `01-BenincaseWhiley38_at_hotmail.com-OTP_DISPATCHED.signup.json`
/// into (`BenincaseWhiley38@hotmail.com`, `OTP_DISPATCHED`). Returns None if
/// the filename doesn't match the dump pattern.
fn parse_dump_name(name: &str) -> Option<(String, String)> {
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name); // strip .json
    let stem = stem.rsplit_once('.').map(|(s, _)| s).unwrap_or(stem); // strip .signup/.verify/.body/.readme
    // After: 01-Email_at_domain.com-STAGE
    let after_first_dash = stem.find('-').map(|i| &stem[i + 1..])?;
    let (email_mangled, stage) = after_first_dash.rsplit_once('-')?;
    let email = email_mangled.replacen("_at_", "@", 1);
    Some((email, stage.to_string()))
}

/// Map outcomes we see in accounts-failed.csv. Used by the UI but kept here so
/// the Rust + TS stay in sync via doc-comment.
pub fn _outcomes() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("INKIRU_BLOCK", "walmart risk model");
    m.insert("EMAIL_EXISTS", "already has a walmart account");
    m.insert("EDGE_BLOCKED", "Akamai/PX 412 — solver pressure or burned proxy");
    m.insert("OTP_VERIFY_FAILED", "OTP came in, verify mutation rejected");
    m.insert("OTHER_ERROR", "transport / PX mint / IMAP failure");
    m
}
