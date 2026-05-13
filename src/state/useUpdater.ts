import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type UpdateInfo = {
  current: string
  latest: string
  is_newer: boolean
  download_url: string
  size: number
  release_notes: string
  published_at: string
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'staged'
  | 'error'

export type UpdaterApi = ReturnType<typeof useUpdater>

export type UpdaterHooks = {
  pushLog?: (line: string) => void
  onStatus?: (s: string) => void
}

export function useUpdater(hooks: UpdaterHooks = {}) {
  const [state, setState] = useState<UpdateState>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const autoCheckedRef = useRef(false)

  // Hold the callbacks in a ref so the check/download/apply closures don't
  // need to re-create every time the parent re-renders.
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks

  const log = useCallback((line: string) => {
    hooksRef.current.pushLog?.(`[updater] ${line}`)
  }, [])
  const status = useCallback((s: string) => {
    hooksRef.current.onStatus?.(s)
  }, [])

  // Subscribe once to the download-progress + upgrade-applied streams.
  useEffect(() => {
    let unA: UnlistenFn | undefined
    let unB: UnlistenFn | undefined
    let cancelled = false
    void (async () => {
      const a = await listen<{ downloaded: number; total: number }>('update-progress', (e) => {
        setProgress(e.payload)
      })
      const b = await listen<string>('upgrade-applied', (e) => {
        const v = e.payload
        log(`Update applied — running v${v}.`)
        status(`Updated to v${v}`)
      })
      if (cancelled) { a(); b() }
      else { unA = a; unB = b }
    })()
    return () => {
      cancelled = true
      if (unA) unA()
      if (unB) unB()
    }
  }, [log, status])

  const check = useCallback(async (silent = false) => {
    setError(null)
    setState('checking')
    if (!silent) status('Checking for updates…')
    log('Checking for updates…')
    try {
      const i = await invoke<UpdateInfo>('check_for_update')
      setInfo(i)
      setLastChecked(new Date())
      if (i.is_newer) {
        setState('available')
        log(`Update available: v${i.current} → v${i.latest} (${i.size.toLocaleString()} bytes).`)
        status(`Update v${i.latest} available`)
      } else {
        setState('up-to-date')
        log(`No updates available. You're on v${i.current}.`)
        if (!silent) status(`Up to date · v${i.current}`)
      }
      return i
    } catch (e) {
      const msg = String(e)
      setError(msg)
      setState('error')
      log(`Update check failed: ${msg}`)
      if (!silent) status('Update check failed')
      throw e
    }
  }, [log, status])

  const download = useCallback(async () => {
    if (!info) return
    setError(null)
    setProgress({ downloaded: 0, total: info.size })
    setState('downloading')
    log(`Downloading v${info.latest}…`)
    status(`Downloading v${info.latest}…`)
    try {
      await invoke<string>('download_update', { url: info.download_url })
      setState('staged')
      log(`v${info.latest} downloaded. Restart to install.`)
      status(`v${info.latest} downloaded — restart to install`)
    } catch (e) {
      const msg = String(e)
      setError(msg)
      setState('error')
      log(`Download failed: ${msg}`)
      status('Update download failed')
    }
  }, [info, log, status])

  const apply = useCallback(async () => {
    log('Applying update — restarting…')
    status('Restarting…')
    try {
      await invoke<void>('apply_update_and_restart')
      // If we returned, the swap failed before exit — surface the error.
      setError('Restart did not occur — see logs')
      setState('error')
      log('Restart did not occur.')
    } catch (e) {
      setError(String(e))
      setState('error')
      log(`Apply failed: ${e}`)
    }
  }, [log, status])

  // Auto-check immediately on first mount.
  useEffect(() => {
    if (autoCheckedRef.current) return
    autoCheckedRef.current = true
    check(true).catch(() => {
      /* silent: state + log already capture the failure */
    })
  }, [check])

  return { state, info, progress, error, lastChecked, check, download, apply }
}
