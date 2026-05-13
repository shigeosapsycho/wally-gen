import { useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type TabId } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TasksPage } from './pages/Tasks'
import { SettingsPage } from './pages/Settings'
import { OutputPage } from './pages/Output'
import { LogsPage } from './pages/Logs'
import { EmailFilterPage } from './pages/EmailFilter'
import { RunProvider } from './state/RunContext'
import { UpdaterProvider } from './state/UpdaterContext'
import { UpdateBanner } from './components/UpdateBanner'

export function App() {
  const [tab, setTab] = useState<TabId>('tasks')
  const [status, setStatus] = useState('Ready')

  return (
    <UpdaterProvider>
    <RunProvider onStatus={setStatus}>
      <div className="flex flex-col h-full bg-bg text-text">
        <TitleBar />
        <UpdateBanner onStatus={setStatus} />
        <div className="flex flex-1 min-h-0">
          <Sidebar active={tab} onChange={setTab} />
          <main className="flex-1 min-w-0 overflow-hidden relative">
            {/* All pages stay mounted so their state survives tab switches.
                Each page owns its own scroll container (Tasks intentionally
                doesn't scroll; the rest do). */}
            <Pane visible={tab === 'tasks'} scroll={false}>
              <TasksPage onStatus={setStatus} />
            </Pane>
            <Pane visible={tab === 'settings'}>
              <SettingsPage onStatus={setStatus} />
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
    </RunProvider>
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
