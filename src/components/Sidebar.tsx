export type TabId = 'tasks' | 'settings' | 'output' | 'logs' | 'filter'

type Item = { id: TabId; label: string; icon: (active: boolean) => React.ReactNode }

const ITEMS: Item[] = [
  { id: 'tasks', label: 'Tasks', icon: (a) => <ClipboardIcon active={a} /> },
  { id: 'settings', label: 'Settings', icon: (a) => <SettingsIcon active={a} /> },
  { id: 'output', label: 'Output', icon: (a) => <FileIcon active={a} /> },
  { id: 'logs', label: 'Logs', icon: (a) => <TerminalIcon active={a} /> },
  { id: 'filter', label: 'Email Filter', icon: (a) => <FunnelIcon active={a} /> },
]

export function Sidebar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <nav className="w-20 shrink-0 border-r border-border bg-bg flex flex-col items-stretch pt-4 gap-1">
      {ITEMS.map((it) => {
        const isActive = active === it.id
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={
              'group flex flex-col items-center gap-1 py-3 mx-2 rounded-lg transition-colors ' +
              (isActive
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text hover:bg-card-2')
            }
          >
            <div className={(isActive ? 'text-accent' : 'text-current') + ' w-5 h-5'}>
              {it.icon(isActive)}
            </div>
            <span className="text-[10.5px] font-medium tracking-tight leading-none">
              {it.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function ClipboardIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}
function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function FileIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  )
}
function TerminalIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  )
}
