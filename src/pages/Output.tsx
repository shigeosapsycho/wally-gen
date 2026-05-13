import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/tauri'

type Props = { onStatus: (s: string) => void }

type SubTab = 'success' | 'failed'
type Row = Record<string, string>

type SortDir = 'asc' | 'desc'
type Sort = { col: string; dir: SortDir } | null

export function OutputPage({ onStatus }: Props) {
  const [sub, setSub] = useState<SubTab>('success')
  const [success, setSuccess] = useState<{ headers: string[]; rows: Row[] }>({ headers: [], rows: [] })
  const [failed, setFailed] = useState<{ headers: string[]; rows: Row[] }>({ headers: [], rows: [] })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [successSort, setSuccessSort] = useState<Sort>(null)
  const [failedSort, setFailedSort] = useState<Sort>(null)

  const load = useMemo(
    () => async () => {
      setLoading(true)
      try {
        const [s, f] = await Promise.all([
          api.readTextFile('accounts.csv').catch(() => ''),
          api.readTextFile('accounts-failed.csv').catch(() => ''),
        ])
        setSuccess(parseCsv(s))
        setFailed(parseCsv(f))
      } catch (e) {
        onStatus(`Read failed: ${e}`)
      } finally {
        setLoading(false)
      }
    },
    [onStatus],
  )

  useEffect(() => { void load() }, [load])

  const cur = sub === 'success' ? success : failed
  const sort = sub === 'success' ? successSort : failedSort
  const setSort = sub === 'success' ? setSuccessSort : setFailedSort

  // Apply free-text filter, then optional sort. Default order is whatever the
  // CSV gave us (engine writes rows in completion order, so unsorted ≈ gen
  // order).
  const visibleRows = useMemo(() => {
    let out = cur.rows
    if (filter.trim()) {
      const f = filter.toLowerCase()
      out = out.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(f)))
    }
    if (sort) {
      out = out.slice().sort((a, b) => {
        const av = (a[sort.col] ?? '').toString()
        const bv = (b[sort.col] ?? '').toString()
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return out
  }, [cur.rows, filter, sort])

  function cycleSort(col: string) {
    setSort((s) => {
      if (!s || s.col !== col) return { col, dir: 'asc' }
      if (s.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  return (
    <div className="px-10 py-8 max-w-[1600px] mx-auto flex flex-col gap-4 h-full">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Output</h1>
          <p className="text-muted text-sm mt-1">
            <code className="font-mono text-text/80">accounts.csv</code> and{' '}
            <code className="font-mono text-text/80">accounts-failed.csv</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="bg-[#0a0a0f] border border-border rounded-md px-3 py-1.5 text-xs w-48 font-mono text-text/90 placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
            spellCheck={false}
          />
          <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={sub === 'success'} onClick={() => setSub('success')} count={success.rows.length}>
          Successes
        </TabButton>
        <TabButton active={sub === 'failed'} onClick={() => setSub('failed')} count={failed.rows.length} fail>
          Failures
        </TabButton>
      </div>

      <div className="card flex-1 min-h-0 overflow-auto">
        {visibleRows.length === 0 ? (
          <div className="p-8 text-muted text-sm">
            {cur.rows.length === 0
              ? sub === 'success' ? 'No accounts yet.' : 'No failures.'
              : 'No rows match the filter.'}
          </div>
        ) : sub === 'success' ? (
          <SuccessTable
            rows={visibleRows}
            sort={sort}
            onSort={cycleSort}
            onCopy={(s) => { navigator.clipboard.writeText(s); onStatus('Copied') }}
          />
        ) : (
          <FailureTable rows={visibleRows} sort={sort} onSort={cycleSort} />
        )}
      </div>

      {sub === 'failed' && failed.rows.length > 0 && (
        <OutcomeSummary rows={failed.rows} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  count,
  fail,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  fail?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative px-4 py-2 text-sm font-medium transition-colors ' +
        (active ? 'text-text' : 'text-muted hover:text-text')
      }
    >
      {children}
      <span
        className={
          'ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tabular-nums ' +
          (active
            ? fail
              ? 'bg-red-500/15 text-red-400'
              : 'bg-emerald-500/15 text-emerald-400'
            : 'bg-card-2 text-muted')
        }
      >
        {count.toLocaleString()}
      </span>
      {active && (
        <span className={'absolute left-0 right-0 -bottom-px h-0.5 rounded-t ' + (fail ? 'bg-red-500' : 'bg-emerald-500')} />
      )}
    </button>
  )
}

function SuccessTable({
  rows,
  sort,
  onSort,
  onCopy,
}: {
  rows: Row[]
  sort: Sort
  onSort: (col: string) => void
  onCopy: (s: string) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card/95 backdrop-blur">
        <tr className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
          <SortableTh col="email" sort={sort} onSort={onSort}>Email</SortableTh>
          <SortableTh col="password" sort={sort} onSort={onSort}>Password</SortableTh>
          <SortableTh col="authCode" sort={sort} onSort={onSort}>Auth code</SortableTh>
          <SortableTh col="otp" sort={sort} onSort={onSort}>OTP</SortableTh>
          <Th className="text-right w-20"></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 hover:bg-card-2/40 group">
            <Td>
              <span className="font-mono text-[12.5px] text-text/90">{r['email']}</span>
            </Td>
            <Td>
              <button
                type="button"
                title="Click to copy"
                onClick={() => onCopy(r['password'] ?? '')}
                className="font-mono text-[12.5px] text-accent hover:underline"
              >
                {r['password']}
              </button>
            </Td>
            <Td>
              <span className="font-mono text-[11.5px] text-text/60 tracking-tight">
                {truncateMiddle(r['authCode'] ?? '', 12)}
              </span>
            </Td>
            <Td>
              <span className="font-mono text-[12.5px] text-cyan-300/90 tabular-nums">
                {r['otp']}
              </span>
            </Td>
            <Td className="text-right w-20">
              <button
                type="button"
                className="text-[11px] text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-accent"
                onClick={() => onCopy(`${r['email']}:${r['password']}`)}
              >
                copy ↵
              </button>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FailureTable({
  rows,
  sort,
  onSort,
}: {
  rows: Row[]
  sort: Sort
  onSort: (col: string) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card/95 backdrop-blur">
        <tr className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
          <SortableTh col="email" sort={sort} onSort={onSort}>Email</SortableTh>
          <SortableTh col="outcome" sort={sort} onSort={onSort}>Outcome</SortableTh>
          <SortableTh col="error_code" sort={sort} onSort={onSort}>Error code</SortableTh>
          <SortableTh col="error_msg" sort={sort} onSort={onSort}>Message</SortableTh>
          <SortableTh col="ts" sort={sort} onSort={onSort} className="w-32">When</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 hover:bg-card-2/40">
            <Td>
              <span className="font-mono text-[12.5px] text-text/90">{r['email']}</span>
            </Td>
            <Td>
              <OutcomeBadge outcome={r['outcome'] ?? ''} />
            </Td>
            <Td>
              {r['error_code'] ? (
                <span className="font-mono text-[11.5px] text-amber-300/90">{r['error_code']}</span>
              ) : (
                <span className="text-muted/50">—</span>
              )}
            </Td>
            <Td>
              <span
                className="font-mono text-[11.5px] text-red-300/80 line-clamp-2 max-w-[640px] block"
                title={r['error_msg']}
              >
                {r['error_msg']}
              </span>
            </Td>
            <Td>
              <span className="font-mono text-[11px] text-muted whitespace-nowrap">
                {formatTs(r['ts'] ?? '')}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SortableTh({
  col,
  sort,
  onSort,
  children,
  className = '',
}: {
  col: string
  sort: Sort
  onSort: (col: string) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sort?.col === col
  const dir = active ? sort!.dir : null
  return (
    <th
      className={'text-left px-4 py-3 border-b border-border font-semibold tracking-[0.12em] uppercase ' + className}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={
          'group inline-flex items-center gap-1.5 transition-colors ' +
          (active ? 'text-text' : 'text-muted hover:text-text')
        }
      >
        <span>{children}</span>
        <SortGlyph dir={dir} />
      </button>
    </th>
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

function OutcomeBadge({ outcome }: { outcome: string }) {
  const { color, label } = outcomeStyle(outcome)
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-tight ' + color}>
      {label}
    </span>
  )
}

function outcomeStyle(o: string): { color: string; label: string } {
  switch (o) {
    case 'INKIRU_BLOCK':
      return { color: 'bg-orange-500/15 text-orange-300', label: 'INKIRU_BLOCK' }
    case 'EMAIL_EXISTS':
      return { color: 'bg-amber-500/15 text-amber-300', label: 'EMAIL_EXISTS' }
    case 'EDGE_BLOCKED':
      return { color: 'bg-red-500/15 text-red-400', label: 'EDGE_BLOCKED' }
    case 'OTP_VERIFY_FAILED':
      return { color: 'bg-rose-500/15 text-rose-300', label: 'OTP_VERIFY_FAILED' }
    case 'OTHER_ERROR':
      return { color: 'bg-red-700/20 text-red-300', label: 'OTHER_ERROR' }
    default:
      return { color: 'bg-card-2 text-muted', label: o || 'unknown' }
  }
}

function OutcomeSummary({ rows }: { rows: Row[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r['outcome'] ?? '', (m.get(r['outcome'] ?? '') ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])
  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(([o, n]) => {
        const { color, label } = outcomeStyle(o)
        return (
          <span key={o} className={'inline-flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-semibold ' + color}>
            {label}
            <span className="text-[11px] font-bold tabular-nums opacity-80">{n.toLocaleString()}</span>
          </span>
        )
      })}
    </div>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={'text-left px-4 py-3 border-b border-border font-semibold tracking-[0.12em] uppercase ' + className}>{children}</th>
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={'px-4 py-2 align-top ' + className}>{children}</td>
}

function truncateMiddle(s: string, keep: number): string {
  if (s.length <= keep * 2 + 1) return s
  return `${s.slice(0, keep)}…${s.slice(-keep)}`
}

function formatTs(ts: string): string {
  if (!ts) return ''
  const m = ts.match(/^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : ts
}

function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvRow(lines[0]!)
  const rows: Row[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]!)
    const row: Row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]!] = cells[j] ?? ''
    rows.push(row)
  }
  return { headers, rows }
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
