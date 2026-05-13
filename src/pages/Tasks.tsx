import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CountBadge } from '../components/Card'
import { api, countNonEmptyLines, envToMap } from '../lib/tauri'
import { useDebouncedSave } from '../state/useDebouncedSave'
import { useRunCtx } from '../state/RunContext'
import { useFilesCtx } from '../state/FilesContext'
import { csvToEmailPass, filterEmailsBySuccess } from '../lib/transforms'
import type { Task } from '../state/useRun'

const ENDLESS_STORAGE_KEY = 'wally-gen.endless'

type Props = { onStatus: (s: string) => void }

type SortCol = 'email' | 'progress' | 'status' | 'password'
type SortDir = 'asc' | 'desc'
type Sort = { col: SortCol; dir: SortDir } | null

export function TasksPage({ onStatus }: Props) {
  const [emails, setEmails] = useState('')
  const [proxies, setProxies] = useState('')
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [loaded, setLoaded] = useState(false)
  const run = useRunCtx()
  const files = useFilesCtx()
  // Suppress the debounced-save when the new value came from an external
  // re-read (Email Filter "Replace emails.txt", etc.) — otherwise we'd
  // immediately write the just-loaded content back to disk.
  const skipNextEmailsSave = useRef(false)
  const skipNextProxiesSave = useRef(false)

  // Initial env load — runs once.
  useEffect(() => {
    let cancelled = false
    api.readEnv().then((env) => {
      if (cancelled) return
      const m = envToMap(env)
      const v = Number.parseInt(m['MAX_CONCURRENT_SOLVES'] ?? '', 10)
      if (Number.isFinite(v) && v > 0) setMaxConcurrent(v)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Load emails.txt initially and re-read whenever something else bumps the
  // tick (e.g. Email Filter overwrote the file).
  useEffect(() => {
    let cancelled = false
    api.readTextFile('emails.txt').then((e) => {
      if (cancelled) return
      // Tick > 0 means this is a reload, not the initial mount — suppress
      // the debounced save that would otherwise write the same content
      // back to disk.
      if (files.emailsTick > 0) skipNextEmailsSave.current = true
      setEmails(e)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [files.emailsTick])

  useEffect(() => {
    let cancelled = false
    api.readTextFile('proxies.txt').then((p) => {
      if (cancelled) return
      if (files.proxiesTick > 0) skipNextProxiesSave.current = true
      setProxies(p)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [files.proxiesTick])

  // Mark "loaded" once both initial reads have happened — useDebouncedSave
  // uses this to skip its first invocation on a cold mount.
  useEffect(() => {
    if (!loaded) setLoaded(true)
  }, [loaded])

  useDebouncedSave(emails, (v) => {
    if (!loaded) return
    if (skipNextEmailsSave.current) { skipNextEmailsSave.current = false; return }
    api.writeTextFile('emails.txt', v).catch((e) => onStatus(`Save failed: ${e}`))
  })
  useDebouncedSave(proxies, (v) => {
    if (!loaded) return
    if (skipNextProxiesSave.current) { skipNextProxiesSave.current = false; return }
    api.writeTextFile('proxies.txt', v).catch((e) => onStatus(`Save failed: ${e}`))
  })

  const emailCount = useMemo(() => countNonEmptyLines(emails), [emails])
  const proxyCount = useMemo(() => countNonEmptyLines(proxies), [proxies])
  const tasks = useMemo(() => Array.from(run.tasks.values()), [run.tasks])

  const [endlessMode, setEndlessMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ENDLESS_STORAGE_KEY) === 'on'
    } catch {
      return false
    }
  })
  // Mirror endlessMode into a ref so the delayed timers inside the chain
  // effect can read the live value (toggling off mid-chain cancels the
  // pending restart, not just future runs).
  const endlessModeRef = useRef(endlessMode)
  useEffect(() => {
    endlessModeRef.current = endlessMode
    try {
      window.localStorage.setItem(ENDLESS_STORAGE_KEY, endlessMode ? 'on' : 'off')
    } catch {
      /* localStorage unavailable */
    }
  }, [endlessMode])

  // Latched at Start time so a user toggling Endless mid-run can't accidentally
  // arm/disarm chaining for the *current* run.
  const startedUnderEndlessRef = useRef(false)
  // Remember the email-list size we kicked off with so a no-progress run
  // (all remaining emails failing) breaks the chain instead of looping.
  const lastRunListSizeRef = useRef(0)
  // Last completedTick we already reacted to, so a second mount or a stale
  // tick can't re-trigger the chain.
  const lastChainTickRef = useRef(0)

  const start = useCallback(() => {
    const list = emails.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (list.length === 0) {
      onStatus('No emails to run')
      return
    }
    if (proxyCount === 0) {
      onStatus('No proxies — fill the proxy list first')
      return
    }
    startedUnderEndlessRef.current = endlessMode
    lastRunListSizeRef.current = list.length
    if (endlessMode) {
      onStatus(`Endless mode armed — chaining until emails.txt is empty (${list.length.toLocaleString()} emails)`)
    }
    void run.start(list)
  }, [emails, proxyCount, endlessMode, run, onStatus])

  const stop = useCallback(() => {
    // Manual stop breaks the chain — explicit user intent overrides the
    // armed Endless flag for this run.
    if (startedUnderEndlessRef.current) {
      startedUnderEndlessRef.current = false
      onStatus('Stopped — Endless mode chain broken')
    }
    void run.stop()
  }, [run, onStatus])

  // Endless chaining: when a run completes naturally, re-filter emails.txt
  // by accounts.csv and start the next pass if there's still work left.
  useEffect(() => {
    if (run.completedTick === 0) return
    if (run.completedTick === lastChainTickRef.current) return
    lastChainTickRef.current = run.completedTick
    if (!startedUnderEndlessRef.current || !endlessModeRef.current) return

    let cancelled = false
    const t = window.setTimeout(async () => {
      if (cancelled || !endlessModeRef.current) return
      try {
        const [accountsCsv, currentMaster] = await Promise.all([
          api.readTextFile('accounts.csv').catch(() => ''),
          api.readTextFile('emails.txt').catch(() => ''),
        ])
        const { lines: successPairs } = csvToEmailPass(accountsCsv)
        const remaining = filterEmailsBySuccess(successPairs.join('\n'), currentMaster)

        if (remaining.length === 0) {
          onStatus('Endless mode: all emails generated 🎉')
          startedUnderEndlessRef.current = false
          return
        }
        if (remaining.length >= lastRunListSizeRef.current) {
          // Zero net successes this pass — every remaining email is
          // failing repeatedly. Stop instead of looping forever.
          onStatus(
            `Endless mode: no progress (${remaining.length.toLocaleString()} remain, all failing). Stopped.`,
          )
          startedUnderEndlessRef.current = false
          return
        }

        await api.writeTextFile('emails.txt', remaining.join('\n') + '\n')
        files.bumpEmails()
        lastRunListSizeRef.current = remaining.length

        onStatus(`Endless mode: chaining (${remaining.length.toLocaleString()} emails left)`)
        // Slight delay so the user can see the new email-list state before
        // the next run kicks off. Reads endlessModeRef so an untick during
        // this window still cancels the restart.
        window.setTimeout(() => {
          if (cancelled || !startedUnderEndlessRef.current || !endlessModeRef.current) return
          void run.start(remaining)
        }, 1500)
      } catch (e) {
        onStatus(`Endless chain failed: ${e}`)
        startedUnderEndlessRef.current = false
      }
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
    // We intentionally exclude `endlessMode` so toggling it mid-completion
    // doesn't re-fire the effect — the ref-latched check above already
    // covers that case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.completedTick])

  return (
    <div className="px-10 py-8 max-w-[1600px] mx-auto h-full flex flex-col gap-5 overflow-hidden">
      <header className="shrink-0 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
        <div className="flex items-center gap-4">
          <label
            className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"
            title="Auto-filter emails.txt by accounts.csv after each run and chain a new run until the list is empty."
          >
            <input
              type="checkbox"
              checked={endlessMode}
              onChange={(e) => setEndlessMode(e.target.checked)}
              className="accent-accent w-4 h-4"
            />
            <span className={endlessMode ? 'text-accent font-medium' : 'text-muted'}>
              Endless mode
            </span>
            {startedUnderEndlessRef.current && run.state === 'running' && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-bold tracking-wider uppercase text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                chaining
              </span>
            )}
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={start}
            disabled={run.state === 'running'}
          >
            Start All
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={stop}
            disabled={run.state !== 'running'}
          >
            Stop
          </button>
        </div>
      </header>

      <div className="shrink-0 card px-5 py-3 flex items-center gap-2 text-sm">
        <RefreshGlyph />
        <span className="font-semibold tabular-nums">{emailCount.toLocaleString()}</span>
        <span className="text-muted">emails loaded</span>
        <span className="text-muted">·</span>
        <span className="text-muted">Max concurrent:</span>
        <span className="font-semibold tabular-nums">{maxConcurrent}</span>
      </div>

      <div className="shrink-0 grid grid-cols-2 gap-4">
        <Card title="Email List" badge={<CountBadge count={emailCount} />}>
          <textarea
            className="mx-4 mb-4 h-32 resize-none rounded-md bg-input border border-border px-4 py-3 font-mono text-[13px] text-text/90 placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
            placeholder="paste one email per line"
            spellCheck={false}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
        </Card>
        <Card title="Proxy List" badge={<CountBadge count={proxyCount} />}>
          <textarea
            className="mx-4 mb-4 h-32 resize-none rounded-md bg-input border border-border px-4 py-3 font-mono text-[13px] text-text/90 placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
            placeholder="paste one proxy per line"
            spellCheck={false}
            value={proxies}
            onChange={(e) => setProxies(e.target.value)}
          />
        </Card>
      </div>

      <TaskTable tasks={tasks} />
    </div>
  )
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  // Default sort: progress descending so completed (and almost-done) rows
  // surface at the top of a live run, pending sinks to the bottom. Clicking
  // the header still cycles through desc → asc → none.
  const [sort, setSort] = useState<Sort>({ col: 'progress', dir: 'desc' })

  const sorted = useMemo(() => {
    if (!sort) return tasks
    const copy = tasks.slice()
    copy.sort((a, b) => {
      const av = sortValue(a, sort.col)
      const bv = sortValue(b, sort.col)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [tasks, sort])

  function cycleSort(col: SortCol) {
    setSort((s) => {
      if (!s || s.col !== col) return { col, dir: 'asc' }
      if (s.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  return (
    <Card className="flex-1 min-h-0">
      <div className="shrink-0 grid grid-cols-[1fr_180px_140px_180px] px-6 pt-5 pb-3 border-b border-border">
        <SortableHeader col="email" sort={sort} onSort={cycleSort}>Email</SortableHeader>
        <SortableHeader col="progress" sort={sort} onSort={cycleSort}>Progress</SortableHeader>
        <SortableHeader col="status" sort={sort} onSort={cycleSort}>Status</SortableHeader>
        <SortableHeader col="password" sort={sort} onSort={cycleSort}>Password</SortableHeader>
      </div>
      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">
          no tasks yet — paste emails above and hit start
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto divide-y divide-border/60">
          {sorted.map((t) => (
            <Row key={t.email} t={t} />
          ))}
        </div>
      )}
    </Card>
  )
}

const STATUS_ORDER: Record<Task['status'], number> = {
  running: 0,
  pending: 1,
  done: 2,
  failed: 3,
}

function sortValue(t: Task, col: SortCol): string | number {
  switch (col) {
    case 'email':
      return t.email.toLowerCase()
    case 'progress': {
      if (t.status === 'done') return STAGE_ORDER.length + 1
      if (t.status === 'failed') return -1
      if (t.stage) {
        const i = STAGE_ORDER.indexOf(t.stage)
        return i >= 0 ? i + 1 : 0
      }
      return 0
    }
    case 'status':
      return STATUS_ORDER[t.status]
    case 'password':
      // Empty passwords sort to the bottom of asc so completed rows cluster
      // together regardless of direction.
      return t.password ?? '￿'
  }
}

function SortableHeader({
  col,
  sort,
  onSort,
  children,
}: {
  col: SortCol
  sort: Sort
  onSort: (col: SortCol) => void
  children: React.ReactNode
}) {
  const active = sort?.col === col
  const dir = active ? sort!.dir : null
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={
        'group inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors text-left ' +
        (active ? 'text-text' : 'text-muted hover:text-text')
      }
    >
      <span>{children}</span>
      <SortGlyph dir={dir} />
    </button>
  )
}

function SortGlyph({ dir }: { dir: SortDir | null }) {
  return (
    <span className="inline-flex flex-col leading-none">
      <svg width="8" height="5" viewBox="0 0 8 5" className={dir === 'asc' ? 'text-accent' : 'text-muted/40'}>
        <path d="M0 5 L4 0 L8 5 Z" fill="currentColor" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" className={dir === 'desc' ? 'text-accent' : 'text-muted/40'}>
        <path d="M0 0 L4 5 L8 0 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

const STAGE_ORDER = ['SIGNUP', 'OTP_DISPATCHED', 'VERIFY', 'ACCOUNT_CREATED']

function Row({ t }: { t: Task }) {
  const stageIdx =
    t.status === 'done' ? STAGE_ORDER.length :
    t.stage ? Math.max(0, STAGE_ORDER.indexOf(t.stage)) + 1 :
    t.status === 'failed' ? 0 : 0
  const pct = (stageIdx / STAGE_ORDER.length) * 100

  return (
    <div className="grid grid-cols-[1fr_180px_140px_180px] items-center px-6 py-2.5 text-sm">
      <div className="font-mono text-[13px] text-text/90 truncate" title={t.email}>{t.email}</div>
      <div className="pr-6">
        <div className="h-1.5 rounded bg-card-2 overflow-hidden">
          <div
            className={
              'h-full rounded ' +
              (t.status === 'done'
                ? 'bg-emerald-500'
                : t.status === 'failed'
                  ? 'bg-red-500/70'
                  : 'bg-accent')
            }
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-muted truncate">
          {t.stage ?? (t.status === 'pending' ? 'pending' : t.status === 'done' ? 'done' : '')}
        </div>
      </div>
      <div>
        <StatusBadge t={t} />
      </div>
      <div className="font-mono text-[12.5px] text-text/80 truncate">
        {t.password ? (
          // Read-only display — use Output → Successes to copy. Disabling
          // selection and right-click discourages casual exfiltration of
          // passwords from someone glancing at the screen.
          <span
            className="select-none"
            onContextMenu={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
          >
            {t.password}
          </span>
        ) : (
          <span className="text-muted/60">—</span>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ t }: { t: Task }) {
  if (t.status === 'done') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        SUCCESS
      </span>
    )
  }
  if (t.status === 'failed') {
    return (
      <span
        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/15 text-red-700 dark:text-red-400 cursor-help"
        title={`${t.outcome ?? ''}${t.errorMsg ? ' — ' + t.errorMsg : ''}`}
      >
        {t.outcome ?? 'failed'}
      </span>
    )
  }
  if (t.status === 'running') {
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-accent/15 text-accent">running</span>
  }
  return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-card-2 text-muted">pending</span>
}

function RefreshGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}
