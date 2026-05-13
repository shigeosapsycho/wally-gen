import { createContext, useContext, type ReactNode } from 'react'
import { useRun } from './useRun'

type Ctx = ReturnType<typeof useRun>

const RunCtx = createContext<Ctx | null>(null)

export function RunProvider({ onStatus, children }: { onStatus: (s: string) => void; children: ReactNode }) {
  const run = useRun(onStatus)
  return <RunCtx.Provider value={run}>{children}</RunCtx.Provider>
}

export function useRunCtx(): Ctx {
  const v = useContext(RunCtx)
  if (!v) throw new Error('useRunCtx must be used inside <RunProvider>')
  return v
}
