import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'wally-gen.animations'

type Ctx = {
  enabled: boolean
  setEnabled: (v: boolean) => void
  toggle: () => void
}

const AnimationsCtx = createContext<Ctx | null>(null)

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function applyAttribute(enabled: boolean) {
  document.documentElement.setAttribute('data-animations', enabled ? 'on' : 'off')
}

export function AnimationsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    const v = readInitial()
    applyAttribute(v)
    return v
  })

  useEffect(() => {
    applyAttribute(enabled)
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
    } catch {
      /* localStorage unavailable */
    }
  }, [enabled])

  const setEnabled = useCallback((v: boolean) => setEnabledState(v), [])
  const toggle = useCallback(() => setEnabledState((v) => !v), [])

  return (
    <AnimationsCtx.Provider value={{ enabled, setEnabled, toggle }}>
      {children}
    </AnimationsCtx.Provider>
  )
}

export function useAnimationsCtx(): Ctx {
  const v = useContext(AnimationsCtx)
  if (!v) throw new Error('useAnimationsCtx must be used inside <AnimationsProvider>')
  return v
}
