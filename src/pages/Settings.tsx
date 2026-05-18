import { useEffect, useMemo, useState } from 'react'
import {
  api,
  envToMap,
  AUTOCLEAN_DUMPS_KEY,
  AUTOCLEAN_DUMPS_KEEP,
  TRUE_ENDLESS_KEY,
  LOG_LINE_CAP_KEY,
  LOG_LINE_CAP_DEFAULT,
  LOG_LINE_CAP_MIN,
  LOG_LINE_CAP_MAX,
  logLineCap,
  type SystemInfo,
} from '../lib/tauri'
import { useRunCtx } from '../state/RunContext'
import { useAnimationsCtx } from '../state/AnimationsContext'
import { useUpdaterCtx } from '../state/UpdaterContext'

type Props = { onStatus: (s: string) => void; onDirtyChange?: (dirty: boolean) => void }

type FieldSpec = {
  key: string
  label: string
  hint?: string
  type?: 'text' | 'password' | 'number'
  kind?: 'imap-host' | 'ram-slider' | 'cpu-slider'
  placeholder?: string
}

// host:port presets the engine's domain-based auto-inference table already
// handles. Picking one of these is equivalent to leaving the field blank for
// users on those providers; setting it explicitly is useful for ops or to
// override a misbehaving auto-inference.
const IMAP_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Auto-detect (recommended)', value: '' },
  { label: 'Gmail · imap.gmail.com:993', value: 'imap.gmail.com:993' },
  { label: 'iCloud · imap.mail.me.com:993', value: 'imap.mail.me.com:993' },
  { label: 'Outlook / Hotmail / Live · outlook.office365.com:993', value: 'outlook.office365.com:993' },
  { label: 'Yahoo · imap.mail.yahoo.com:993', value: 'imap.mail.yahoo.com:993' },
  { label: 'AOL · imap.aol.com:993', value: 'imap.aol.com:993' },
  { label: 'IONOS · imap.ionos.com:993', value: 'imap.ionos.com:993' },
]

type Group = { title: string; fields: FieldSpec[] }

const GROUPS: Group[] = [
  {
    title: 'IMAP',
    fields: [
      { key: 'IMAP_USER', label: 'IMAP user', hint: 'Catchall mailbox where OTPs arrive', placeholder: 'catchall@gmail.com' },
      { key: 'IMAP_PASS', label: 'IMAP password', hint: 'Gmail App Password / per-app password (spaces stripped)', placeholder: 'xxxx xxxx xxxx xxxx' },
      { key: 'IMAP_HOST', label: 'IMAP host', hint: 'Pick your provider or choose Other to enter a custom host:port', kind: 'imap-host' },
    ],
  },
  {
    title: 'Local solver',
    fields: [
      { key: 'LOCAL_SOLVER_PORT', label: 'Port', type: 'number', placeholder: '8080' },
      { key: 'RAM_GB', label: 'RAM (GB)', hint: 'RAM for PX Solver', kind: 'ram-slider' },
      { key: 'VCPUS', label: 'vCPUs', hint: 'Logical Processors for px-solver', kind: 'cpu-slider' },
      { key: 'MAX_CONCURRENT_SOLVES', label: 'Max concurrent solves', type: 'number', placeholder: '8' },
      { key: 'SOLVER_API_KEY', label: 'Solver API key', placeholder: 'local-mclovinbot' },
    ],
  },
  {
    title: 'Engine',
    fields: [
      { key: 'CONCURRENCY', label: 'Concurrency', hint: 'Parallel signup workers (10–20 is the sweet spot)', type: 'number', placeholder: '10' },
      { key: 'MAX_RETRIES', label: 'Max retries', hint: 'Per-email retry budget on edge failures', type: 'number', placeholder: '3' },
      { key: 'PAUSE_MS', label: 'Pause (ms)', hint: 'Milliseconds between major HTTP steps', type: 'number', placeholder: '400' },
    ],
  },
]

export function SettingsPage({ onStatus, onDirtyChange }: Props) {
  const run = useRunCtx()
  // While a run is in progress, the engine has already loaded the current
  // .env into its process — editing it now would just be confusing (the
  // new values won't take effect until the next Start). Lock the form to
  // make that clear instead of silently letting the user edit dead inputs.
  const locked = run.state === 'running'

  const [values, setValues] = useState<Record<string, string>>({})
  // Snapshot of the values as last loaded/saved — `dirty` is derived from
  // comparing this baseline to the current `values`. That way editing a field
  // and reverting it back to its original value correctly clears the dirty
  // state, instead of latching on the first keystroke.
  const [baseline, setBaseline] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // Host hardware ceilings for the local-solver sliders. Null until the
  // Tauri call returns; sliders fall back to a disabled state in the gap.
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  const dirty = useMemo(() => !recordsEqual(values, baseline), [values, baseline])

  useEffect(() => {
    api.readEnv().then((lines) => {
      const m = envToMap(lines)
      setValues(m)
      setBaseline(m)
      setLoaded(true)
    }).catch((e) => onStatus(`Read .env failed: ${e}`))
  }, [onStatus])

  useEffect(() => {
    api.systemInfo().then(setSysInfo).catch((e) => onStatus(`System info failed: ${e}`))
  }, [onStatus])

  // Surface the dirty state to App so it can confirm navigation away.
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function update(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      await api.writeEnv(values)
      setBaseline({ ...values })
      onStatus('Settings saved')
    } catch (e) {
      onStatus(`Save failed: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-10 py-8 max-w-[900px] mx-auto flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted text-sm mt-1">
            Edits <code className="font-mono text-text/80">.env</code> in place, preserving comments
            and order.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && !saving && !locked && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={!loaded || saving || !dirty || locked}
            title={locked ? 'A run is in progress — stop it first to edit settings' : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {locked && (
        <div className="card flex items-center gap-3 px-4 py-3 text-sm bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>
            A run is in progress — settings are locked. Stop the run before editing.
          </span>
        </div>
      )}

      {GROUPS.map((g) => (
        <section key={g.title} className="card">
          <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
            {g.title}
          </h2>
          <div className="px-6 pb-6 grid grid-cols-1 gap-5">
            {g.fields.map((f) => {
              if (f.kind === 'imap-host') {
                return (
                  <ImapHostField
                    key={f.key}
                    spec={f}
                    value={values[f.key] ?? ''}
                    onChange={(v) => update(f.key, v)}
                    disabled={!loaded || locked}
                  />
                )
              }
              if (f.kind === 'ram-slider' || f.kind === 'cpu-slider') {
                const max = f.kind === 'ram-slider' ? sysInfo?.total_ram_gb : sysInfo?.logical_cpus
                const unit = f.kind === 'ram-slider' ? 'GB' : 'vCPUs'
                return (
                  <SliderField
                    key={f.key}
                    spec={f}
                    value={values[f.key] ?? ''}
                    onChange={(v) => update(f.key, v)}
                    disabled={!loaded || locked}
                    max={max}
                    unit={unit}
                  />
                )
              }
              return (
                <Field
                  key={f.key}
                  spec={f}
                  value={values[f.key] ?? ''}
                  onChange={(v) => update(f.key, v)}
                  disabled={!loaded || locked}
                />
              )
            })}
            {g.title === 'IMAP' && (
              <ImapTestRow
                user={values['IMAP_USER'] ?? ''}
                pass={values['IMAP_PASS'] ?? ''}
                host={values['IMAP_HOST'] ?? ''}
                disabled={!loaded || locked}
                onStatus={onStatus}
              />
            )}
          </div>
        </section>
      ))}

      <AppearanceSection />

      <AutocleanSection onStatus={onStatus} />

      <EndlessModeSection />

      <LogsSection />

      <UpdatesSection />
    </div>
  )
}

function LogsSection() {
  const run = useRunCtx()
  const [cap, setCap] = useState<number>(() => logLineCap())
  const [draft, setDraft] = useState<string>(String(cap))

  function commit() {
    const n = Number.parseInt(draft, 10)
    if (!Number.isFinite(n)) {
      setDraft(String(cap))
      return
    }
    const clamped = Math.min(LOG_LINE_CAP_MAX, Math.max(LOG_LINE_CAP_MIN, n))
    setDraft(String(clamped))
    try {
      window.localStorage.setItem(LOG_LINE_CAP_KEY, String(clamped))
    } catch {
      /* localStorage unavailable */
    }
    setCap(clamped)
    run.trimLogs()
  }

  return (
    <section className="card">
      <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
        Logs
      </h2>
      <div className="px-6 pb-6 grid grid-cols-[200px_1fr] gap-6 items-start">
        <div>
          <div className="text-sm font-medium text-text">Log line cap</div>
          <div className="text-xs text-muted mt-1">
            How many lines the Logs tab keeps in memory; older lines are dropped.
            Default {LOG_LINE_CAP_DEFAULT.toLocaleString()}. Range{' '}
            {LOG_LINE_CAP_MIN.toLocaleString()}–{LOG_LINE_CAP_MAX.toLocaleString()}.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            }}
            className="w-32 bg-input border border-border rounded-md px-3 py-2 font-mono text-[13px] text-text/90 focus:outline-none focus:ring-1 focus:ring-accent/40"
            spellCheck={false}
          />
          <span className="text-xs text-muted">lines</span>
        </div>
      </div>
    </section>
  )
}

function EndlessModeSection() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(TRUE_ENDLESS_KEY) !== 'off'
    } catch {
      return true
    }
  })

  function toggle(next: boolean) {
    setEnabled(next)
    try {
      window.localStorage.setItem(TRUE_ENDLESS_KEY, next ? 'on' : 'off')
    } catch {
      /* localStorage unavailable */
    }
  }

  return (
    <section className="card">
      <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
        Endless mode
      </h2>
      <div className="px-6 pb-6 grid grid-cols-[200px_1fr] gap-6 items-start">
        <div>
          <div className="text-sm font-medium text-text">Enable true endless mode</div>
          <div className="text-xs text-muted mt-1">
            Normally Endless mode stops chaining when a pass makes zero progress
            (every remaining email failing). With this on, it keeps looping
            regardless — stop the run manually to break out.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className={enabled ? 'text-text' : 'text-muted'}>
            {enabled ? 'True endless mode on' : 'True endless mode off'}
          </span>
        </label>
      </div>
    </section>
  )
}

function AutocleanSection({ onStatus }: { onStatus: (s: string) => void }) {
  const run = useRunCtx()
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(AUTOCLEAN_DUMPS_KEY) === 'on'
    } catch {
      return false
    }
  })

  function toggle(next: boolean) {
    setEnabled(next)
    try {
      window.localStorage.setItem(AUTOCLEAN_DUMPS_KEY, next ? 'on' : 'off')
    } catch {
      /* localStorage unavailable */
    }
    // Prune immediately on enable so the user sees it take effect — but never
    // mid-run, since the engine is actively writing into the newest folder.
    if (next && run.state !== 'running') {
      api
        .autocleanDumps(AUTOCLEAN_DUMPS_KEEP)
        .then((n) =>
          onStatus(
            n > 0 ? `Autoclean: removed ${n} old dump folder(s)` : 'Autoclean: nothing to remove',
          ),
        )
        .catch((e) => onStatus(`Autoclean failed: ${e}`))
    }
  }

  return (
    <section className="card">
      <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
        Autoclean Dumps
      </h2>
      <div className="px-6 pb-6 grid grid-cols-[200px_1fr] gap-6 items-start">
        <div>
          <div className="text-sm font-medium text-text">Autoclean dumps</div>
          <div className="text-xs text-muted mt-1">
            Keeps only the {AUTOCLEAN_DUMPS_KEEP} most recent run folders in{' '}
            <code className="font-mono text-text/80">dumps/</code>; older ones are deleted
            when a run starts.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className={enabled ? 'text-text' : 'text-muted'}>
            {enabled ? `Keeping last ${AUTOCLEAN_DUMPS_KEEP} runs` : 'Autoclean off'}
          </span>
        </label>
      </div>
    </section>
  )
}

function AppearanceSection() {
  const { enabled, setEnabled } = useAnimationsCtx()
  return (
    <section className="card">
      <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
        Appearance
      </h2>
      <div className="px-6 pb-6 grid grid-cols-[200px_1fr] gap-6 items-start">
        <div>
          <div className="text-sm font-medium text-text">Animations</div>
          <div className="text-xs text-muted mt-1">
            Spinning refresh glyph, pulsing dots, fades, and transitions.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className={enabled ? 'text-text' : 'text-muted'}>
            {enabled ? 'Animations enabled' : 'Animations off'}
          </span>
        </label>
      </div>
    </section>
  )
}

function UpdatesSection() {
  const u = useUpdaterCtx()
  return (
    <section className="card">
      <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
        Updates
      </h2>
      <div className="px-6 pb-6 grid grid-cols-[200px_1fr] gap-6 items-start">
        <div>
          <div className="text-sm font-medium text-text">Auto-update</div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Installed:</span>
            <span className="font-mono text-text/90">v{u.info?.current ?? 'unknown'}</span>
            {u.info && (
              <>
                <span className="text-muted">·</span>
                <span className="text-muted">Latest:</span>
                <span className="font-mono text-text/90">v{u.info.latest}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-3 text-xs"
              onClick={() => void u.check()}
              disabled={u.state === 'checking' || u.state === 'downloading'}
            >
              {u.state === 'checking' ? 'Checking…' : 'Check now'}
            </button>
            <span className="text-xs text-muted">
              {u.state === 'up-to-date' && 'You’re on the latest version.'}
              {u.state === 'available' && u.info && `v${u.info.latest} is available.`}
              {u.state === 'downloading' && 'Downloading…'}
              {u.state === 'staged' && 'Update staged. Restart to apply.'}
              {u.state === 'error' && (u.error ?? 'Check failed.')}
              {u.state === 'idle' && u.lastChecked === null && 'Not yet checked.'}
            </span>
          </div>
          {u.info?.is_newer && u.info.release_notes && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-text">Release notes</summary>
              <pre className="mt-2 p-3 bg-input border border-border rounded-md font-mono text-[11.5px] text-text/80 whitespace-pre-wrap max-h-48 overflow-auto">
                {u.info.release_notes}
              </pre>
            </details>
          )}
        </div>
      </div>
    </section>
  )
}

function recordsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function ImapHostField({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: FieldSpec
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const matchedPreset = IMAP_PRESETS.find((p) => p.value === value)
  const isCustom = !matchedPreset && value.length > 0
  // Track the dropdown selection separately from the persisted value so the
  // user can sit on "Other" with an empty custom input without us snapping
  // back to "Auto-detect".
  const [mode, setMode] = useState<string>(isCustom ? '__other__' : value)

  // Re-sync once the env load completes (initial render runs with value="").
  useEffect(() => {
    const m = IMAP_PRESETS.find((p) => p.value === value)
    setMode(m ? value : value ? '__other__' : '')
  }, [value])

  function pickPreset(next: string) {
    setMode(next)
    if (next === '__other__') {
      // Don't clobber an existing custom value when toggling to Other.
      if (!isCustom) onChange('')
    } else {
      onChange(next)
    }
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
      <div>
        <div className="text-sm font-medium text-text">{spec.label}</div>
        {spec.hint && <div className="text-xs text-muted mt-1">{spec.hint}</div>}
        <div className="text-[10px] text-muted/70 font-mono mt-1">{spec.key}</div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <select
            value={mode}
            onChange={(e) => pickPreset(e.target.value)}
            disabled={disabled}
            className="w-full appearance-none bg-input border border-border rounded-md pl-3 pr-9 py-2 text-[13px] text-text/90 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50 cursor-pointer"
          >
            {IMAP_PRESETS.map((p) => (
              <option key={p.value || 'auto'} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="__other__">Other (custom host:port)</option>
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {mode === '__other__' && (
          <input
            className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono text-[13px] text-text/90 placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
            placeholder="mail.privateemail.com:993"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
          />
        )}
      </div>
    </div>
  )
}

function SliderField({
  spec,
  value,
  onChange,
  disabled,
  max,
  unit,
}: {
  spec: FieldSpec
  value: string
  onChange: (v: string) => void
  disabled: boolean
  // undefined while the system-info Tauri call is still in flight.
  max: number | undefined
  unit: string
}) {
  const ready = typeof max === 'number' && max >= 1
  const ceiling = ready ? max : 1
  const parsed = Number.parseInt(value, 10)
  // Clamp visible position to [1, ceiling] even when the persisted env value
  // is empty or exceeds the current host (e.g. .env copied from a beefier
  // machine). Don't write back on display — only when the user actually moves
  // the slider — so we don't silently dirty the form on load.
  const display = Number.isFinite(parsed)
    ? Math.min(ceiling, Math.max(1, parsed))
    : Math.min(ceiling, 2)

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
      <div>
        <div className="text-sm font-medium text-text">{spec.label}</div>
        {spec.hint && <div className="text-xs text-muted mt-1">{spec.hint}</div>}
        <div className="text-[10px] text-muted/70 font-mono mt-1">{spec.key}</div>
      </div>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={1}
          max={ceiling}
          step={1}
          value={display}
          onChange={(e) => onChange(String(Math.round(Number(e.target.value))))}
          disabled={disabled || !ready}
          className="flex-1 accent-accent disabled:opacity-50"
        />
        <div className="font-mono text-sm text-text/90 tabular-nums whitespace-nowrap min-w-[6.5rem] text-right">
          {display} <span className="text-muted">/ {ceiling} {unit}</span>
        </div>
      </div>
    </div>
  )
}

function Field({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: FieldSpec
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const [reveal, setReveal] = useState(false)
  const isPassword = spec.type === 'password'
  return (
    <label className="grid grid-cols-[200px_1fr] gap-6 items-start">
      <div>
        <div className="text-sm font-medium text-text">{spec.label}</div>
        {spec.hint && <div className="text-xs text-muted mt-1">{spec.hint}</div>}
        <div className="text-[10px] text-muted/70 font-mono mt-1">{spec.key}</div>
      </div>
      <div className="relative">
        <input
          className="w-full bg-input border border-border rounded-md px-3 py-2 font-mono text-[13px] text-text/90 placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
          type={isPassword && !reveal ? 'password' : spec.type === 'number' ? 'text' : 'text'}
          inputMode={spec.type === 'number' ? 'numeric' : undefined}
          placeholder={spec.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-card-2"
            tabIndex={-1}
          >
            {reveal ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </label>
  )
}

function ImapTestRow({
  user,
  pass,
  host,
  disabled,
  onStatus,
}: {
  user: string
  pass: string
  host: string
  disabled: boolean
  onStatus: (s: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Form-level disabled (env not loaded yet / run in progress) is final, but
  // even when those are clear we still need user+pass before login can mean
  // anything — block the button rather than send an empty LOGIN.
  const canTest = !disabled && user.trim().length > 0 && pass.length > 0

  async function test() {
    setBusy(true)
    setResult(null)
    try {
      const msg = await api.testImap(user, pass, host)
      setResult({ ok: true, msg })
      onStatus(`IMAP: ${msg}`)
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/, '')
      setResult({ ok: false, msg })
      onStatus(`IMAP test failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6 items-start pt-1">
      <div>
        <div className="text-sm font-medium text-text">Test connection</div>
        <div className="text-xs text-muted mt-1">
          Pings the IMAP to see if the connection works or not.
        </div>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <button
          type="button"
          onClick={test}
          disabled={!canTest || busy}
          className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-50"
          title={
            !user.trim() || !pass
              ? 'Fill in IMAP user and password first'
              : 'Connect to the IMAP server and log in'
          }
        >
          {busy ? 'Testing…' : 'Test connection'}
        </button>
        {result && (
          <div
            className={
              'text-xs px-3 py-2 rounded-md border max-w-full break-words ' +
              (result.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300')
            }
          >
            {result.msg}
          </div>
        )}
      </div>
    </div>
  )
}
