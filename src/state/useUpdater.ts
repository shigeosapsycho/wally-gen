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

export function useUpdater() {
  const [state, setState] = useState<UpdateState>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const autoCheckedRef = useRef(false)

  // Subscribe once to the download-progress stream.
  useEffect(() => {
    let un: UnlistenFn | undefined
    let cancelled = false
    void (async () => {
      const u = await listen<{ downloaded: number; total: number }>('update-progress', (e) => {
        setProgress(e.payload)
      })
      if (cancelled) u()
      else un = u
    })()
    return () => {
      cancelled = true
      if (un) un()
    }
  }, [])

  const check = useCallback(async () => {
    setError(null)
    setState('checking')
    try {
      const i = await invoke<UpdateInfo>('check_for_update')
      setInfo(i)
      setLastChecked(new Date())
      setState(i.is_newer ? 'available' : 'up-to-date')
      return i
    } catch (e) {
      const msg = String(e)
      setError(msg)
      setState('error')
      throw e
    }
  }, [])

  const download = useCallback(async () => {
    if (!info) return
    setError(null)
    setProgress({ downloaded: 0, total: info.size })
    setState('downloading')
    try {
      await invoke<string>('download_update', { url: info.download_url })
      setState('staged')
    } catch (e) {
      const msg = String(e)
      setError(msg)
      setState('error')
    }
  }, [info])

  const apply = useCallback(async () => {
    try {
      await invoke<void>('apply_update_and_restart')
      // If we returned, the swap failed before exit — surface the error.
      setError('Restart did not occur — see logs')
      setState('error')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [])

  // Fire one background check ~3s after launch so it doesn't compete with
  // the UI's initial reads.
  useEffect(() => {
    if (autoCheckedRef.current) return
    autoCheckedRef.current = true
    const t = window.setTimeout(() => {
      check().catch(() => {
        /* silent: error surfaces in UI state */
      })
    }, 3000)
    return () => window.clearTimeout(t)
  }, [check])

  return { state, info, progress, error, lastChecked, check, download, apply }
}
