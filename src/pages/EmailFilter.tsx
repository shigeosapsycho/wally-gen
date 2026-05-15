import { useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { api, countNonEmptyLines } from '../lib/tauri'
import { csvToEmailPass, filterEmailsBySuccess } from '../lib/transforms'
import { useFilesCtx } from '../state/FilesContext'

// Persisted path of the user-chosen master-list .txt. When absent, the Master
// panel falls back to the runtime emails.txt (which can be desynced after
// engine runs / Endless mode chaining / the Replace action below).
const MASTER_SOURCE_KEY = 'wally-gen.master-source-path'

type Props = { onStatus: (s: string) => void }

export function EmailFilterPage({ onStatus }: Props) {
  const [success, setSuccess] = useState('')
  const [master, setMaster] = useState('')
  const [result, setResult] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<'csv' | 'master' | 'save' | 'pick' | null>(null)
  const [masterSource, setMasterSource] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(MASTER_SOURCE_KEY)
    } catch {
      return null
    }
  })
  const files = useFilesCtx()

  const successCount = useMemo(() => countNonEmptyLines(success), [success])
  const masterCount = useMemo(() => countNonEmptyLines(master), [master])

  async function loadFromAccountsCsv() {
    setBusy('csv')
    try {
      const csv = await api.readTextFile('accounts.csv')
      const { lines } = csvToEmailPass(csv)
      setSuccess(lines.join('\n'))
      onStatus(`Loaded ${lines.length.toLocaleString()} from accounts.csv`)
    } catch (e) {
      onStatus(`Load failed: ${e}`)
    } finally {
      setBusy(null)
    }
  }

  async function loadFromMaster() {
    setBusy('master')
    try {
      const txt = masterSource
        ? await api.readTextFileAbs(masterSource)
        : await api.readTextFile('emails.txt')
      const label = masterSource ? basename(masterSource) : 'emails.txt'
      setMaster(txt)
      onStatus(`Loaded ${countNonEmptyLines(txt).toLocaleString()} from ${label}`)
    } catch (e) {
      onStatus(`Load failed: ${e}`)
    } finally {
      setBusy(null)
    }
  }

  async function pickMasterSource() {
    setBusy('pick')
    try {
      const picked = await open({
        title: 'Choose a master list .txt',
        multiple: false,
        directory: false,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      })
      if (typeof picked !== 'string') return
      try {
        window.localStorage.setItem(MASTER_SOURCE_KEY, picked)
      } catch {
        /* localStorage unavailable */
      }
      setMasterSource(picked)
      // Load it right away so the panel reflects the new source without a
      // second click.
      const txt = await api.readTextFileAbs(picked)
      setMaster(txt)
      onStatus(
        `Referencing ${basename(picked)} (${countNonEmptyLines(txt).toLocaleString()} emails)`,
      )
    } catch (e) {
      onStatus(`Pick failed: ${e}`)
    } finally {
      setBusy(null)
    }
  }

  function resetMasterSource() {
    try {
      window.localStorage.removeItem(MASTER_SOURCE_KEY)
    } catch {
      /* localStorage unavailable */
    }
    setMasterSource(null)
    onStatus('Master source reset to emails.txt')
  }

  function run() {
    const out = filterEmailsBySuccess(success, master)
    setResult(out)
    onStatus(`${out.length.toLocaleString()} emails remain after filter`)
  }

  async function replaceEmailsTxt() {
    if (!result) return
    setBusy('save')
    try {
      await api.writeTextFile('emails.txt', result.join('\n') + '\n')
      // Tell the rest of the app that emails.txt changed so the Tasks
      // tab's paste box re-reads from disk instead of showing stale
      // contents.
      files.bumpEmails()
      onStatus(`Replaced emails.txt (${result.length.toLocaleString()} emails)`)
    } catch (e) {
      onStatus(`Replace failed: ${e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-10 py-8 max-w-[1400px] mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Email Filter</h1>
        <p className="text-muted text-sm mt-1">
          Returns master-list emails that aren't already in <code className="font-mono text-text/80">accounts.csv</code>.
          Success rows are matched as <code className="font-mono text-text/80">email:password</code>; only the email
          portion is compared (case-insensitive).
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <Panel
          title="Success list"
          subtitle="email:password per line"
          count={successCount}
          actionLabel={busy === 'csv' ? 'Loading…' : 'Load from accounts.csv'}
          onAction={loadFromAccountsCsv}
          disabled={busy !== null}
          value={success}
          onChange={setSuccess}
          placeholder="email:password"
        />
        <Panel
          title="Master list"
          subtitle={
            masterSource ? `referencing ${basename(masterSource)}` : 'one email per line'
          }
          count={masterCount}
          actionLabel={
            busy === 'master'
              ? 'Loading…'
              : `Load from ${masterSource ? basename(masterSource) : 'emails.txt'}`
          }
          onAction={loadFromMaster}
          disabled={busy !== null}
          value={master}
          onChange={setMaster}
          placeholder="email@example.com"
          extra={
            <div className="px-4 pb-4 text-[11px] text-muted flex items-center gap-3">
              <button
                type="button"
                onClick={pickMasterSource}
                disabled={busy !== null}
                title={masterSource ?? 'Pick a permanent .txt to reference instead of emails.txt'}
                className="underline underline-offset-2 hover:text-text disabled:opacity-50"
              >
                {busy === 'pick'
                  ? 'Picking…'
                  : masterSource
                    ? 'change reference'
                    : 'reference from .txt instead'}
              </button>
              {masterSource && (
                <button
                  type="button"
                  onClick={resetMasterSource}
                  disabled={busy !== null}
                  className="underline underline-offset-2 hover:text-text disabled:opacity-50"
                >
                  reset to emails.txt
                </button>
              )}
            </div>
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <button type="button" className="btn-primary" onClick={run} disabled={!master.trim() || busy !== null}>
          Filter
        </button>
        {result && (
          <div className="text-sm text-muted">
            <span className="text-text font-semibold tabular-nums">{result.length.toLocaleString()}</span>{' '}
            remain ({(masterCount - result.length).toLocaleString()} filtered out)
          </div>
        )}
      </div>

      {result !== null && (
        <section className="card">
          <header className="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">Filtered master</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary !py-1.5 !px-3 text-xs"
                onClick={() => navigator.clipboard.writeText(result.join('\n'))}
                disabled={result.length === 0}
              >
                Copy
              </button>
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                onClick={replaceEmailsTxt}
                disabled={busy !== null || result.length === 0}
              >
                {busy === 'save' ? 'Replacing…' : 'Replace emails.txt'}
              </button>
            </div>
          </header>
          {result.length === 0 ? (
            <div className="px-5 pb-5 text-muted text-sm">Every master email was filtered out.</div>
          ) : (
            <pre className="mx-4 mb-4 max-h-[40vh] overflow-auto rounded-md bg-input border border-border px-4 py-3 font-mono text-[13px] text-text/90 whitespace-pre-wrap break-all">
              {result.join('\n')}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  count,
  actionLabel,
  onAction,
  disabled,
  value,
  onChange,
  placeholder,
  extra,
}: {
  title: string
  subtitle: string
  count: number
  actionLabel: string
  onAction: () => void
  disabled: boolean
  value: string
  onChange: (v: string) => void
  placeholder: string
  extra?: React.ReactNode
}) {
  return (
    <section className="card flex flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">{title}</h2>
          <div className="text-[10px] text-muted/70 mt-0.5">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill tabular-nums">{count.toLocaleString()}</span>
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            {actionLabel}
          </button>
        </div>
      </header>
      <textarea
        className="mx-4 mb-4 h-56 resize-none rounded-md bg-input border border-border px-4 py-3 font-mono text-[13px] text-text/90 placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {extra}
    </section>
  )
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i >= 0 ? p.slice(i + 1) : p
}
