import { useCallback, useEffect, useState } from 'react'
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
import { UpdateBanner } from './components/UpdateBanner'

export function App() {
  const [tab, setTab] = useState<TabId>('tasks')
  const [status, setStatus] = useState('Ready')
  const [settingsDirty, setSettingsDirty] = useState(false)

  const changeTab = useCallback(
    (next: TabId) => {
      if (next === tab) return
      if (tab === 'settings' && settingsDirty) {
        const ok = window.confirm(
          'You have unsaved settings changes. Leave without saving?\n\n' +
            'Press OK to discard your changes, or Cancel to stay on Settings.',
        )
        if (!ok) return
        // User chose to discard — the SettingsPage stays mounted with its
        // edited values; they're just no longer flagged as preventing nav.
        setSettingsDirty(false)
      }
      setTab(next)
    },
    [tab, settingsDirty],
  )

  // Intercept the window's close request when Settings has unsaved changes.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    const win = getCurrentWindow()
    void win.onCloseRequested((event) => {
      if (settingsDirty) {
        const ok = window.confirm(
          'You have unsaved settings changes. Close without saving?\n\n' +
            'Press OK to discard and close, or Cancel to stay.',
        )
        if (!ok) event.preventDefault()
      }
    }).then((un) => { unlisten = un })
    return () => { unlisten?.() }
  }, [settingsDirty])

  return (
    <ThemeProvider>
    <RunProvider onStatus={setStatus}>
      <UpdaterBridge onStatus={setStatus}>
        <div className="flex flex-col h-full bg-bg text-text">
          <TitleBar />
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
          <StatusBar text={status} />
        </div>
      </UpdaterBridge>
    </RunProvider>
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
