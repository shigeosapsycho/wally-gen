import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useConfirm } from './state/ConfirmContext'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type TabId } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TasksPage } from './pages/Tasks'
import { SettingsPage } from './pages/Settings'
import { OutputPage } from './pages/Output'
import { LogsPage } from './pages/Logs'
import { EmailFilterPage } from './pages/EmailFilter'
import { RunProvider, useRunCtx } from './state/RunContext'
import { UpdaterProvider } from './state/UpdaterContext'
import { ThemeProvider } from './state/ThemeContext'
import { AnimationsProvider } from './state/AnimationsContext'
import { FilesProvider, useFilesCtx } from './state/FilesContext'
import { UpdateBanner } from './components/UpdateBanner'
import { promoteEmailExists } from './lib/consolidate'
import { api, FAILURES_CAP } from './lib/tauri'

export function App() {
  const [tab, setTab] = useState<TabId>('tasks')
  const [status, setStatus] = useState('Ready')
  const [settingsDirty, setSettingsDirty] = useState(false)
  const confirm = useConfirm()

  // `navWarned` suppresses the leave-Settings prompt after the user has
  // acknowledged it once during a single dirty session. The banner in the
  // status bar stays visible regardless — only the dialog is one-shot. As
  // soon as the form goes clean again (save, or external reload), the gate
  // resets so a fresh round of edits will prompt anew.
  const [navWarned, setNavWarned] = useState(false)
  useEffect(() => {
    if (!settingsDirty) setNavWarned(false)
  }, [settingsDirty])

  const changeTab = useCallback(
    (next: TabId) => {
      if (next === tab) return
      if (tab === 'settings' && settingsDirty && !navWarned) {
        // Native confirm() can fail to render on a Tauri window with custom
        // decorations; the in-app <ConfirmDialog> renders inside the React
        // tree so it always anchors correctly and matches the chrome.
        void (async () => {
          const ok = await confirm(
            'You have unsaved settings changes. Leave anyway?\n\n' +
              'Your edits stay pending — you can come back and finish, or save now.',
            { title: 'Leave Settings?', kind: 'warning', okLabel: 'Leave', cancelLabel: 'Stay' },
          )
          if (!ok) return
          setNavWarned(true)
          setTab(next)
        })()
        return
      }
      setTab(next)
    },
    [tab, settingsDirty, navWarned, confirm],
  )

  // Guard the close click directly rather than via onCloseRequested. The
  // listener-based approach captured `settingsDirty` in a closure and a stale
  // closure (left over by Vite HMR + Strict Mode re-mounts) could silently
  // preventDefault during dev. Handling it on the X button means each click
  // reads the current value, no listener bookkeeping needed. Trade-off: this
  // path is bypassed for Alt+F4 / taskbar-close — those go through Tauri's
  // default close behavior without a prompt.
  const requestClose = useCallback(async () => {
    if (settingsDirty) {
      const ok = await confirm(
        'You have unsaved settings changes. Close without saving?',
        { title: 'Close Wally Gen?', kind: 'warning', okLabel: 'Close', cancelLabel: 'Stay' },
      )
      if (!ok) return
      setSettingsDirty(false)
    }
    void getCurrentWindow().close()
  }, [settingsDirty, confirm])

  return (
    <ThemeProvider>
    <AnimationsProvider>
    <FilesProvider>
    <RunWithFilesBridge onStatus={setStatus}>
      <UpdaterBridge onStatus={setStatus}>
        <div className="flex flex-col h-full bg-bg text-text">
          <TitleBar onClose={requestClose} />
          <UpdateBanner onStatus={setStatus} />
          <div className="flex flex-1 min-h-0">
            <Sidebar active={tab} onChange={changeTab} />
            <main className="flex-1 min-w-0 overflow-hidden relative">
              <Pane visible={tab === 'tasks'} scroll={false}>
                <TasksPage onStatus={setStatus} />
              </Pane>
              <Pane visible={tab === 'settings'}>
                <SettingsPage onStatus={setStatus} onDirtyChange={setSettingsDirty} />
              </Pane>
              <Pane visible={tab === 'output'}>
                <OutputPage onStatus={setStatus} />
              </Pane>
              <Pane visible={tab === 'logs'} scroll={false}>
                <LogsPage onStatus={setStatus} />
              </Pane>
              <Pane visible={tab === 'filter'}>
                <EmailFilterPage onStatus={setStatus} />
              </Pane>
            </main>
          </div>
          <StatusBarBound
            text={status}
            warning={settingsDirty ? 'Unsaved changes in Settings' : undefined}
          />
        </div>
      </UpdaterBridge>
    </RunWithFilesBridge>
    </FilesProvider>
    </AnimationsProvider>
    </ThemeProvider>
  )
}

/** Wires RunProvider so finalizeRun's EMAIL_EXISTS promotion can refresh
 *  the Output tab via FilesContext ticks, and runs a one-shot promotion
 *  on app launch to clean up any pre-existing rows. */
function RunWithFilesBridge({
  onStatus,
  children,
}: {
  onStatus: (s: string) => void
  children: React.ReactNode
}) {
  const files = useFilesCtx()
  // Pass a stable bump pair to RunProvider for post-run promotion refreshes.
  // Both accounts.csv and accounts-failed.csv are rewritten by the promotion
  // so we bump both ticks.
  const onPromote = useMemo(
    () => () => { files.bumpAccounts(); files.bumpFailed() },
    [files],
  )
  // Live auto-refresh for Output as the engine appends to either CSV.
  // Wired through useRun's debounced fail/done hooks so the Output tab
  // re-reads from disk automatically — no Refresh button required.
  const onFailedRow = useMemo(() => () => files.bumpFailed(), [files])
  const onDoneRow = useMemo(() => () => files.bumpAccounts(), [files])

  // One-shot launch sweep: backfill any EMAIL_EXISTS rows from previous
  // runs that pre-date this feature, then trim accounts-failed.csv to its
  // hard cap so old data from before this feature doesn't sit forever.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await promoteEmailExists()
      if (cancelled) return
      if (res.error) {
        onStatus(`Promote EMAIL_EXISTS failed: ${res.error}`)
      } else if (res.promoted > 0) {
        files.bumpAccounts()
        files.bumpFailed()
        onStatus(`Promoted ${res.promoted} EMAIL_EXISTS row(s) to accounts.csv on launch`)
      }
      try {
        const removed = await api.capFailedCsv(FAILURES_CAP)
        if (cancelled) return
        if (removed > 0) {
          files.bumpFailed()
          onStatus(`Capped accounts-failed.csv — removed ${removed} oldest row(s)`)
        }
      } catch (e) {
        onStatus(`Cap failures on launch failed: ${e}`)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <RunProvider
      onStatus={onStatus}
      hooks={{ onPromoteEmailExists: onPromote, onFailedRow, onDoneRow }}
    >
      {children}
    </RunProvider>
  )
}

/** Bridges the Run log buffer + status bar into the updater hooks so its
 *  state transitions show up in the Logs tab and the bottom status. */
function UpdaterBridge({
  onStatus,
  children,
}: {
  onStatus: (s: string) => void
  children: React.ReactNode
}) {
  const run = useRunCtx()
  return (
    <UpdaterProvider pushLog={run.pushSystemLog} onStatus={onStatus}>
      {children}
    </UpdaterProvider>
  )
}

/** Reads the run task map so the bottom bar can show live success/fail
 *  counts without piping them through every page's props. */
function StatusBarBound({ text, warning }: { text: string; warning?: string }) {
  const { tasks } = useRunCtx()
  const { successCount, failCount } = useMemo(() => {
    let s = 0
    let f = 0
    for (const t of tasks.values()) {
      if (t.status === 'done') s++
      else if (t.status === 'failed') f++
    }
    return { successCount: s, failCount: f }
  }, [tasks])
  return (
    <StatusBar
      text={text}
      warning={warning}
      successCount={successCount}
      failCount={failCount}
    />
  )
}

function Pane({
  visible,
  scroll = true,
  children,
}: {
  visible: boolean
  scroll?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'absolute inset-0 ' +
        (scroll ? 'overflow-auto ' : 'overflow-hidden ') +
        (visible ? '' : 'invisible pointer-events-none')
      }
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}
