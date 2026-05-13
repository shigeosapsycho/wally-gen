import { createContext, useContext, type ReactNode } from 'react'
import { useUpdater, type UpdaterApi, type UpdaterHooks } from './useUpdater'

const Ctx = createContext<UpdaterApi | null>(null)

export function UpdaterProvider({
  pushLog,
  onStatus,
  children,
}: UpdaterHooks & { children: ReactNode }) {
  const api = useUpdater({ pushLog, onStatus })
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useUpdaterCtx(): UpdaterApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUpdaterCtx must be used inside <UpdaterProvider>')
  return v
}
