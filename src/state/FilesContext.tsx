import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// A pair of monotonically-increasing counters that other parts of the app
// bump whenever they overwrite `emails.txt` or `proxies.txt` on disk. Tasks
// subscribes to these so its paste boxes re-read from disk after an external
// write — e.g. Email Filter pressing "Replace emails.txt".
type Ctx = {
  emailsTick: number
  proxiesTick: number
  bumpEmails: () => void
  bumpProxies: () => void
}

const FilesCtx = createContext<Ctx | null>(null)

export function FilesProvider({ children }: { children: ReactNode }) {
  const [emailsTick, setEmailsTick] = useState(0)
  const [proxiesTick, setProxiesTick] = useState(0)
  const bumpEmails = useCallback(() => setEmailsTick((t) => t + 1), [])
  const bumpProxies = useCallback(() => setProxiesTick((t) => t + 1), [])
  return (
    <FilesCtx.Provider value={{ emailsTick, proxiesTick, bumpEmails, bumpProxies }}>
      {children}
    </FilesCtx.Provider>
  )
}

export function useFilesCtx(): Ctx {
  const v = useContext(FilesCtx)
  if (!v) throw new Error('useFilesCtx must be used inside <FilesProvider>')
  return v
}
