import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
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
import { FilesProvider } from './state/FilesContext'
import { UpdateBanner } from './components/UpdateBanner'

export function App() {
  const [tab, setTab] = useState<TabId>('tasks')
  const [status, setStatus] = useState('Ready')
  const [settingsDirty, setSettingsDirty] = useState(false)

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
        const ok = window.confirm(
          'You have unsaved settings changes. Leave anyway?\n\n' +
            'Your edits stay pending — you can come back and finish, or save now. ' +
            'Press OK to leave, Cancel to stay.',
        )
        if (!ok) return
        setNavWarned(true)
      }
      setTab(next)
    },
    [tab, settingsDirty, navWarned],
  )

  // Guard the close click directly rather than via onCloseRequested. The
  // listener-based approach captured `settingsDirty` in a closure and a stale
  // closure (left over by Vite HMR + Strict Mode re-mounts) could silently
  // preventDefault during dev. Handling it on the X button means each click
  // reads the current value, no listener bookkeeping needed. Trade-off: this
  // path is bypassed for Alt+F4 / taskbar-close — those go through Tauri's
  // default close behavior without a prompt.
  const requestClose = useCallback(() => {
    if (settingsDirty) {
      const ok = window.confirm(
        'You have unsaved settings changes. Close without saving?\n\n' +
          'Press OK to discard and close, or Cancel to stay.',
      )
      if (!ok) return
      setSettingsDirty(false)
    }
    void getCurrentWindow().close()
  }, [settingsDirty])

  return (
    <ThemeProvider>
    <FilesProvider>
    <RunProvider onStatus={setStatus}>
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
    </RunProvider>
    </FilesProvider>
    </ThemeProvider>
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
