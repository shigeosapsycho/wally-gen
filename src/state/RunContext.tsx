import { createContext, useContext, type ReactNode } from 'react'
import { useRun, type RunHooks } from './useRun'

type Ctx = ReturnType<typeof useRun>

const RunCtx = createContext<Ctx | null>(null)

export function RunProvider({
  onStatus,
  hooks,
  children,
}: {
  onStatus: (s: string) => void
  hooks?: RunHooks
  children: ReactNode
}) {
  const run = useRun(onStatus, hooks)
  return <RunCtx.Provider value={run}>{children}</RunCtx.Provider>
}

export function useRunCtx(): Ctx {
  const v = useContext(RunCtx)
  if (!v) throw new Error('useRunCtx must be used inside <RunProvider>')
  return v
}
