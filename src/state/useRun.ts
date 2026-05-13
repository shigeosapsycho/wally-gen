import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Marker the engine prints at the very end of a successful run (run.bat
// echoes it before the trailing `pause`). Stable enough to use as the
// "engine is done, reconcile" signal.
const RUN_COMPLETE_PATTERN = /Run complete/i

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export type Task = {
  email: string
  stage?: string
  status: TaskStatus
  password?: string
  outcome?: string
  errorCode?: string
  errorMsg?: string
}

export type LogLine = { line: string; stream: 'stdout' | 'stderr' | 'system' }

export type RunState = 'idle' | 'running' | 'stopped'

const MAX_LOG_LINES = 10_000

export function useRun(onStatus: (s: string) => void) {
  const [state, setState] = useState<RunState>('idle')
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map())
  const [logs, setLogs] = useState<LogLine[]>([])
  // Bumps each time finalizeRun finishes its reconciliation. Consumers
  // (e.g. endless mode in Tasks) subscribe to this to know when a run
  // wrapped up naturally — distinct from a user-initiated stop.
  const [completedTick, setCompletedTick] = useState(0)

  // Mutable handles so the listeners don't get torn down across re-renders.
  const unlistenRef = useRef<UnlistenFn[]>([])

  useEffect(() => {
    // Establish event listeners once and reuse them across mounts.
    let cancelled = false
    ;(async () => {
      const u1 = await listen<LogLine>('log', (e) => {
        setLogs((cur) => {
          const next = cur.length >= MAX_LOG_LINES ? cur.slice(-MAX_LOG_LINES + 1) : cur.slice()
          next.push(e.payload)
          return next
        })
        // run.bat ends with a `pause` that hangs cmd.exe forever in a
        // hidden window. When the engine prints its "Run complete" banner
        // we yank the wrapper ourselves and reconcile any tasks the watcher
        // might have missed under high write load.
        if (e.payload.stream === 'stdout' && RUN_COMPLETE_PATTERN.test(e.payload.line)) {
          void finalizeRun()
        }
      })
      const u2 = await listen<{ email: string; stage: string }>('stage', (e) => {
        setTasks((cur) =>
          upsert(cur, e.payload.email, (t) => ({
            ...t,
            // ACCOUNT_CREATED is the terminal success stage written by the
            // engine before the accounts.csv tail catches up — treat it as
            // already done so the badge flips to SUCCESS immediately, even
            // before the password row shows up. The later `done` event
            // backfills the password without changing status.
            status: e.payload.stage === 'ACCOUNT_CREATED' ? 'done' : 'running',
            stage: e.payload.stage,
          })),
        )
      })
      const u3 = await listen<{ email: string; password: string }>('done', (e) => {
        setTasks((cur) => upsert(cur, e.payload.email, (t) => ({ ...t, status: 'done', password: e.payload.password })))
      })
      const u4 = await listen<{ email: string; outcome: string; errorCode: string; errorMsg: string }>('fail', (e) => {
        setTasks((cur) => upsert(cur, e.payload.email, (t) => ({
          ...t,
          status: 'failed',
          outcome: e.payload.outcome,
          errorCode: e.payload.errorCode,
          errorMsg: e.payload.errorMsg,
        })))
      })
      const u5 = await listen<{ code: number | null }>('exit', (e) => {
        setState('stopped')
        onStatus(`Run exited (code ${e.payload.code ?? '—'})`)
      })
      if (cancelled) {
        u1(); u2(); u3(); u4(); u5()
      } else {
        unlistenRef.current = [u1, u2, u3, u4, u5]
      }
    })()
    return () => {
      cancelled = true
      for (const u of unlistenRef.current) u()
      unlistenRef.current = []
    }
  }, [onStatus])

  const start = useCallback(
    async (emails: string[]) => {
      // Seed tasks immediately so the table populates before run.bat has written
      // anything; statuses transition as events arrive.
      setTasks(() => {
        const m = new Map<string, Task>()
        for (const e of emails) {
          const k = e.trim()
          if (k) m.set(k, { email: k, status: 'pending' })
        }
        return m
      })
      try {
        await invoke('start_run')
        setState('running')
        onStatus('Running')
      } catch (e) {
        onStatus(`Start failed: ${e}`)
      }
    },
    [onStatus],
  )

  const stop = useCallback(async () => {
    try {
      await invoke('stop_run')
      setState('stopped')
      onStatus('Stopped')
    } catch (e) {
      onStatus(`Stop failed: ${e}`)
    }
  }, [onStatus])

  const clearLogs = useCallback(() => setLogs([]), [])

  const pushSystemLog = useCallback((line: string) => {
    setLogs((cur) => {
      const next = cur.length >= MAX_LOG_LINES ? cur.slice(-MAX_LOG_LINES + 1) : cur.slice()
      next.push({ line, stream: 'system' })
      return next
    })
  }, [])

  // Guard against firing finalize twice for the same run (run.bat's tally +
  // the trailing "Run complete" banner can both match the pattern; we only
  // want to act once).
  const finalizingRef = useRef(false)

  async function finalizeRun() {
    if (finalizingRef.current) return
    finalizingRef.current = true
    pushSystemLog('Engine reported Run complete — reaping cmd.exe and reconciling tasks.')

    // Kill the cmd.exe wrapper so it doesn't sit on `pause` indefinitely.
    void invoke('stop_run').catch(() => {})

    // Give any in-flight notify events ~500 ms to land before we snapshot
    // the CSVs — minimises the chance of a row landing in our reconcile
    // pass AND a "done"/"fail" event arriving moments later (idempotent
    // either way, but cleaner this way).
    await new Promise((r) => setTimeout(r, 500))

    try {
      const [accountsCsv, failedCsv] = await Promise.all([
        invoke<string>('read_text_file', { relPath: 'accounts.csv' }).catch(() => ''),
        invoke<string>('read_text_file', { relPath: 'accounts-failed.csv' }).catch(() => ''),
      ])
      const successByEmail = indexCsvByEmail(accountsCsv)
      const failedByEmail = indexCsvByEmail(failedCsv)

      let reconciled = 0
      let unknown = 0
      setTasks((cur) => {
        const next = new Map(cur)
        for (const [email, t] of cur) {
          if (t.status === 'done' || t.status === 'failed') continue
          const ok = successByEmail.get(email.toLowerCase())
          if (ok) {
            next.set(email, { ...t, status: 'done', password: ok['password'] ?? t.password })
            reconciled++
            continue
          }
          const bad = failedByEmail.get(email.toLowerCase())
          if (bad) {
            next.set(email, {
              ...t,
              status: 'failed',
              outcome: bad['outcome'] ?? t.outcome,
              errorCode: bad['error_code'] ?? t.errorCode,
              errorMsg: bad['error_msg'] ?? t.errorMsg,
            })
            reconciled++
            continue
          }
          // Engine never wrote a terminal row for this email — usually an
          // unrecoverable transport error before the engine got to the CSV
          // append. Mark it so the UI doesn't pretend it's still working.
          next.set(email, { ...t, status: 'failed', outcome: t.outcome ?? 'UNKNOWN' })
          unknown++
        }
        return next
      })

      pushSystemLog(
        `Reconcile complete · ${reconciled} row(s) caught up from CSVs · ${unknown} row(s) had no terminal record (marked UNKNOWN).`,
      )
    } catch (e) {
      pushSystemLog(`Reconcile failed: ${e}`)
    } finally {
      // Always bump completedTick so listeners (endless mode) react even
      // if reconcile threw — they can read the CSVs themselves.
      setCompletedTick((t) => t + 1)
    }
  }

  // Reset the finalize guard whenever a new run starts.
  const wrappedStart = useCallback(
    async (emails: string[]) => {
      finalizingRef.current = false
      await start(emails)
    },
    [start],
  )

  return { state, tasks, logs, completedTick, start: wrappedStart, stop, clearLogs, pushSystemLog }
}

/** Parse a CSV with a header row into a case-insensitive lookup keyed by the
 *  `email` column. Later rows win on duplicate emails (which matches the
 *  engine's "last attempt wins" semantics for accounts-failed.csv). */
function indexCsvByEmail(text: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return out
  const headers = parseCsvRow(lines[0]!)
  const emailIdx = headers.findIndex((h) => h.toLowerCase() === 'email')
  if (emailIdx === -1) return out
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]!)
    const email = (cells[emailIdx] ?? '').trim().toLowerCase()
    if (!email) continue
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]!] = cells[j] ?? ''
    out.set(email, row)
  }
  return out
}

function parseCsvRow(row: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!
    if (inQuotes) {
      if (c === '"') {
        if (row[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === ',') { out.push(field); field = '' }
    else if (c === '"' && field.length === 0) inQuotes = true
    else if (c === '\r') {}
    else field += c
  }
  out.push(field)
  return out
}

function upsert(map: Map<string, Task>, email: string, fn: (t: Task) => Task): Map<string, Task> {
  const next = new Map(map)
  const cur = next.get(email) ?? { email, status: 'pending' as TaskStatus }
  next.set(email, fn(cur))
  return next
}
