import { useEffect, useMemo, useState } from 'react'
import { api, envToMap } from '../lib/tauri'
import { useUpdaterCtx } from '../state/UpdaterContext'

type Props = { onStatus: (s: string) => void; onDirtyChange?: (dirty: boolean) => void }

type FieldSpec = {
  key: string
  label: string
  hint?: string
  type?: 'text' | 'password' | 'number'
  kind?: 'imap-host'
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
      { key: 'IMAP_PASS', label: 'IMAP password', hint: 'Gmail App Password / per-app password (spaces stripped)', type: 'password', placeholder: 'xxxx xxxx xxxx xxxx' },
      { key: 'IMAP_HOST', label: 'IMAP host', hint: 'Pick your provider or choose Other to enter a custom host:port', kind: 'imap-host' },
    ],
  },
  {
    title: 'Local solver',
    fields: [
      { key: 'LOCAL_SOLVER_PORT', label: 'Port', type: 'number', placeholder: '8080' },
      { key: 'RAM_GB', label: 'RAM (GB)', hint: 'GOMEMLIMIT for px-solver', type: 'number', placeholder: '2' },
      { key: 'VCPUS', label: 'vCPUs', hint: 'GOMAXPROCS for px-solver', type: 'number', placeholder: '2' },
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
  const [values, setValues] = useState<Record<string, string>>({})
  // Snapshot of the values as last loaded/saved — `dirty` is derived from
  // comparing this baseline to the current `values`. That way editing a field
  // and reverting it back to its original value correctly clears the dirty
  // state, instead of latching on the first keystroke.
  const [baseline, setBaseline] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = useMemo(() => !recordsEqual(values, baseline), [values, baseline])

  useEffect(() => {
    api.readEnv().then((lines) => {
      const m = envToMap(lines)
      setValues(m)
      setBaseline(m)
      setLoaded(true)
    }).catch((e) => onStatus(`Read .env failed: ${e}`))
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
          {dirty && !saving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={!loaded || saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className="card">
          <h2 className="px-6 pt-5 pb-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
            {g.title}
          </h2>
          <div className="px-6 pb-6 grid grid-cols-1 gap-5">
            {g.fields.map((f) =>
              f.kind === 'imap-host' ? (
                <ImapHostField
                  key={f.key}
                  spec={f}
                  value={values[f.key] ?? ''}
                  onChange={(v) => update(f.key, v)}
                  disabled={!loaded}
                />
              ) : (
                <Field
                  key={f.key}
                  spec={f}
                  value={values[f.key] ?? ''}
                  onChange={(v) => update(f.key, v)}
                  disabled={!loaded}
                />
              ),
            )}
          </div>
        </section>
      ))}

      <UpdatesSection />
    </div>
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
          <div className="text-xs text-muted mt-1">
            Checks GitHub Releases on launch. Updates are staged and applied on restart.
          </div>
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
