import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// A pair of monotonically-increasing counters that other parts of the app
// bump whenever they overwrite `emails.txt` or `proxies.txt` on disk. Tasks
// subscribes to these so its paste boxes re-read from disk after an external
// write — e.g. Email Filter pressing "Replace emails.txt".
type Ctx = {
  emailsTick: number
  proxiesTick: number
  accountsTick: number
  failedTick: number
  bumpEmails: () => void
  bumpProxies: () => void
  bumpAccounts: () => void
  bumpFailed: () => void
}

const FilesCtx = createContext<Ctx | null>(null)

export function FilesProvider({ children }: { children: ReactNode }) {
  const [emailsTick, setEmailsTick] = useState(0)
  const [proxiesTick, setProxiesTick] = useState(0)
  const [accountsTick, setAccountsTick] = useState(0)
  const [failedTick, setFailedTick] = useState(0)
  const bumpEmails = useCallback(() => setEmailsTick((t) => t + 1), [])
  const bumpProxies = useCallback(() => setProxiesTick((t) => t + 1), [])
  const bumpAccounts = useCallback(() => setAccountsTick((t) => t + 1), [])
  const bumpFailed = useCallback(() => setFailedTick((t) => t + 1), [])
  return (
    <FilesCtx.Provider
      value={{
        emailsTick,
        proxiesTick,
        accountsTick,
        failedTick,
        bumpEmails,
        bumpProxies,
        bumpAccounts,
        bumpFailed,
      }}
    >
      {children}
    </FilesCtx.Provider>
  )
}

export function useFilesCtx(): Ctx {
  const v = useContext(FilesCtx)
  if (!v) throw new Error('useFilesCtx must be used inside <FilesProvider>')
  return v
}
