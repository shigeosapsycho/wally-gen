import { createContext, useContext, type ReactNode } from 'react'
import { useUpdater, type UpdaterApi } from './useUpdater'

const Ctx = createContext<UpdaterApi | null>(null)

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const api = useUpdater()
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useUpdaterCtx(): UpdaterApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUpdaterCtx must be used inside <UpdaterProvider>')
  return v
}
