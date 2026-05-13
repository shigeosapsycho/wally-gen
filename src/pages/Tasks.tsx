import { useEffect, useMemo, useState } from 'react'
import { Card, CountBadge } from '../components/Card'
import { api, countNonEmptyLines, envToMap } from '../lib/tauri'
import { useDebouncedSave } from '../state/useDebouncedSave'
import { useRunCtx } from '../state/RunContext'
import type { Task } from '../state/useRun'

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

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.readTextFile('emails.txt').catch(() => ''),
      api.readTextFile('proxies.txt').catch(() => ''),
      api.readEnv().catch(() => []),
    ]).then(([e, p, env]) => {
      if (cancelled) return
      setEmails(e)
      setProxies(p)
      const m = envToMap(env)
      const v = Number.parseInt(m['MAX_CONCURRENT_SOLVES'] ?? '', 10)
      if (Number.isFinite(v) && v > 0) setMaxConcurrent(v)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  useDebouncedSave(emails, (v) => {
    if (!loaded) return
    api.writeTextFile('emails.txt', v).catch((e) => onStatus(`Save failed: ${e}`))
  })
  useDebouncedSave(proxies, (v) => {
    if (!loaded) return
    api.writeTextFile('proxies.txt', v).catch((e) => onStatus(`Save failed: ${e}`))
  })

  const emailCount = useMemo(() => countNonEmptyLines(emails), [emails])
  const proxyCount = useMemo(() => countNonEmptyLines(proxies), [proxies])
  const tasks = useMemo(() => Array.from(run.tasks.values()), [run.tasks])

  function start() {
    const list = emails.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (list.length === 0) {
      onStatus('No emails to run')
      return
    }
    if (proxyCount === 0) {
      onStatus('No proxies — fill the proxy list first')
      return
    }
    void run.start(list)
  }

  return (
    <div className="px-10 py-8 max-w-[1600px] mx-auto h-full flex flex-col gap-5 overflow-hidden">
      <header className="shrink-0 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
        <div className="flex gap-3">
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
            onClick={() => void run.stop()}
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
  const [sort, setSort] = useState<Sort>(null)

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
              (t.status === 'failed' ? 'bg-red-500/70' : 'bg-accent')
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
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(t.password!)}
            className="hover:text-accent transition-colors"
            title="Click to copy"
          >
            {t.password}
          </button>
        ) : (
          <span className="text-muted/60">—</span>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ t }: { t: Task }) {
  if (t.status === 'done') {
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">done</span>
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
