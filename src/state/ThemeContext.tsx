import { createContext, useContext, type ReactNode } from 'react'
import { useTheme } from './useTheme'

type Ctx = ReturnType<typeof useTheme>

const ThemeCtx = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const t = useTheme()
  return <ThemeCtx.Provider value={t}>{children}</ThemeCtx.Provider>
}

export function useThemeCtx(): Ctx {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error('useThemeCtx must be used inside <ThemeProvider>')
  return v
}
