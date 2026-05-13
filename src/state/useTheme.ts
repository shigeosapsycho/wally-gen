import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'wally-gen.theme'
const PREFERS_DARK = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'system' || v === 'light' || v === 'dark') return v
  } catch {
    /* localStorage unavailable */
  }
  // Default to system so new installs follow OS chrome.
  return 'system'
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(PREFERS_DARK).matches
  } catch {
    return true
  }
}

function resolve(preference: ThemePreference): EffectiveTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

function applyTheme(effective: EffectiveTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', effective === 'dark')
  root.setAttribute('data-theme', effective)
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const p = readPreference()
    applyTheme(resolve(p))
    return p
  })
  const [effective, setEffective] = useState<EffectiveTheme>(() => resolve(preference))

  // Keep DOM + persisted preference in sync when the user changes it.
  useEffect(() => {
    const e = resolve(preference)
    setEffective(e)
    applyTheme(e)
    try {
      window.localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* localStorage unavailable */
    }
  }, [preference])

  // While preference = system, also react to the OS toggling at runtime so
  // the app flips along with it without needing a restart.
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia(PREFERS_DARK)
    const onChange = () => {
      const e: EffectiveTheme = mq.matches ? 'dark' : 'light'
      setEffective(e)
      applyTheme(e)
    }
    // Older Safari uses addListener; modern uses addEventListener.
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      mq.removeListener?.(onChange)
    }
  }, [preference])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
  }, [])

  // Title-bar quick-toggle: snap to an explicit choice opposite the current
  // effective theme. Always escapes "system" by design.
  const toggle = useCallback(() => {
    setPreferenceState((p) => {
      const cur = resolve(p)
      return cur === 'dark' ? 'light' : 'dark'
    })
  }, [])

  return { preference, effective, setPreference, toggle }
}
