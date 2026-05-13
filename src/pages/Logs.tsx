import { useEffect, useRef, useState } from 'react'
import { useRunCtx } from '../state/RunContext'

type Props = { onStatus: (s: string) => void }

export function LogsPage({ onStatus }: Props) {
  const { logs, clearLogs } = useRunCtx()
  const [autoscroll, setAutoscroll] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoscroll) return
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs.length, autoscroll])

  function copyAll() {
    navigator.clipboard.writeText(logs.map((l) => l.line).join('\n'))
    onStatus(`Copied ${logs.length.toLocaleString()} lines`)
  }

  return (
    <div className="px-10 py-8 max-w-[1600px] mx-auto flex flex-col gap-4 h-full">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Logs</h1>
          <p className="text-muted text-sm mt-1">
            Raw stdout/stderr from <code className="font-mono text-text/80">run.bat</code> ({logs.length.toLocaleString()} lines).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted select-none">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
              className="accent-accent"
            />
            Autoscroll
          </label>
          <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={copyAll} disabled={logs.length === 0}>
            Copy all
          </button>
          <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={clearLogs} disabled={logs.length === 0}>
            Clear
          </button>
        </div>
      </header>

      <div
        ref={ref}
        className="card flex-1 min-h-0 overflow-auto bg-[#0a0a0f] font-mono text-[12.5px] leading-[1.55] p-4"
      >
        {logs.length === 0 ? (
          <div className="text-muted/70 italic">no logs yet — hit Start All on the Tasks tab.</div>
        ) : (
          logs.map((l, i) => <LogRow key={i} line={l.line} stream={l.stream} />)
        )}
      </div>
    </div>
  )
}

function LogRow({ line, stream }: { line: string; stream: 'stdout' | 'stderr' | 'system' }) {
  return (
    <div className={lineColor(line, stream) + ' whitespace-pre-wrap break-all'}>
      {highlight(line || ' ')}
    </div>
  )
}

function lineColor(line: string, stream: 'stdout' | 'stderr' | 'system'): string {
  if (stream === 'system') return 'text-accent/85'
  if (stream === 'stderr') return 'text-red-300/85'
  const u = line.toUpperCase()
  if (
    u.includes('ACCOUNT_CREATED') ||
    u.includes('SOLVER ONLINE') ||
    u.includes('RUN COMPLETE')
  ) {
    return 'text-emerald-300/90'
  }
  if (u.includes('OTP_DISPATCHED') || u.includes('OTP_RECEIVED')) {
    return 'text-cyan-300/90'
  }
  if (
    u.includes('EDGE_BLOCKED') ||
    u.includes('OTP_VERIFY_FAILED') ||
    u.includes('OTHER_ERROR') ||
    u.includes(' ERROR') ||
    u.startsWith('ERROR') ||
    u.includes('FAILED') ||
    u.includes('TIMED OUT')
  ) {
    return 'text-red-300/90'
  }
  if (
    u.includes('INKIRU_BLOCK') ||
    u.includes('EMAIL_EXISTS') ||
    u.includes('WARN') ||
    u.includes('RETRY')
  ) {
    return 'text-amber-300/90'
  }
  if (u.startsWith('==>') || u.startsWith('===') || u.includes('STARTING ')) {
    return 'text-accent/90'
  }
  return 'text-text/80'
}

const HIGHLIGHTS: Array<{ re: RegExp; className: string }> = [
  { re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, className: 'text-muted/80' },
  { re: /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, className: 'text-sky-300/80' },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, className: 'text-violet-300/90' },
  { re: /\bHTTP\s\d{3}\b/g, className: 'text-amber-300/90' },
]

function highlight(line: string): React.ReactNode {
  let parts: Array<{ text: string; className?: string }> = [{ text: line }]
  for (const { re, className } of HIGHLIGHTS) {
    const next: typeof parts = []
    for (const p of parts) {
      if (p.className) {
        next.push(p)
        continue
      }
      const r = new RegExp(re.source, re.flags)
      let lastIdx = 0
      let m: RegExpExecArray | null
      while ((m = r.exec(p.text)) !== null) {
        if (m.index > lastIdx) next.push({ text: p.text.slice(lastIdx, m.index) })
        next.push({ text: m[0], className })
        lastIdx = m.index + m[0].length
      }
      if (lastIdx < p.text.length) next.push({ text: p.text.slice(lastIdx) })
    }
    parts = next
  }
  return parts.map((p, i) =>
    p.className ? <span key={i} className={p.className}>{p.text}</span> : <span key={i}>{p.text}</span>,
  )
}
