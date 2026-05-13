import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export type Task = {
  email: string
  stage?: string
  status: TaskStatus
  password?: string
  outcome?: string
  errorCode?: string
  errorMsg?: string
}

export type LogLine = { line: string; stream: 'stdout' | 'stderr' | 'system' }

export type RunState = 'idle' | 'running' | 'stopped'

const MAX_LOG_LINES = 10_000

export function useRun(onStatus: (s: string) => void) {
  const [state, setState] = useState<RunState>('idle')
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map())
  const [logs, setLogs] = useState<LogLine[]>([])

  // Mutable handles so the listeners don't get torn down across re-renders.
  const unlistenRef = useRef<UnlistenFn[]>([])

  useEffect(() => {
    // Establish event listeners once and reuse them across mounts.
    let cancelled = false
    ;(async () => {
      const u1 = await listen<LogLine>('log', (e) => {
        setLogs((cur) => {
          const next = cur.length >= MAX_LOG_LINES ? cur.slice(-MAX_LOG_LINES + 1) : cur.slice()
          next.push(e.payload)
          return next
        })
      })
      const u2 = await listen<{ email: string; stage: string }>('stage', (e) => {
        setTasks((cur) => upsert(cur, e.payload.email, (t) => ({ ...t, status: 'running', stage: e.payload.stage })))
      })
      const u3 = await listen<{ email: string; password: string }>('done', (e) => {
        setTasks((cur) => upsert(cur, e.payload.email, (t) => ({ ...t, status: 'done', password: e.payload.password })))
      })
      const u4 = await listen<{ email: string; outcome: string; errorCode: string; errorMsg: string }>('fail', (e) => {
        setTasks((cur) => upsert(cur, e.payload.email, (t) => ({
          ...t,
          status: 'failed',
          outcome: e.payload.outcome,
          errorCode: e.payload.errorCode,
          errorMsg: e.payload.errorMsg,
        })))
      })
      const u5 = await listen<{ code: number | null }>('exit', (e) => {
        setState('stopped')
        onStatus(`Run exited (code ${e.payload.code ?? '—'})`)
      })
      if (cancelled) {
        u1(); u2(); u3(); u4(); u5()
      } else {
        unlistenRef.current = [u1, u2, u3, u4, u5]
      }
    })()
    return () => {
      cancelled = true
      for (const u of unlistenRef.current) u()
      unlistenRef.current = []
    }
  }, [onStatus])

  const start = useCallback(
    async (emails: string[]) => {
      // Seed tasks immediately so the table populates before run.bat has written
      // anything; statuses transition as events arrive.
      setTasks(() => {
        const m = new Map<string, Task>()
        for (const e of emails) {
          const k = e.trim()
          if (k) m.set(k, { email: k, status: 'pending' })
        }
        return m
      })
      try {
        await invoke('start_run')
        setState('running')
        onStatus(`Running (${emails.length.toLocaleString()})`)
      } catch (e) {
        onStatus(`Start failed: ${e}`)
      }
    },
    [onStatus],
  )

  const stop = useCallback(async () => {
    try {
      await invoke('stop_run')
      setState('stopped')
      onStatus('Stopped')
    } catch (e) {
      onStatus(`Stop failed: ${e}`)
    }
  }, [onStatus])

  const clearLogs = useCallback(() => setLogs([]), [])

  const pushSystemLog = useCallback((line: string) => {
    setLogs((cur) => {
      const next = cur.length >= MAX_LOG_LINES ? cur.slice(-MAX_LOG_LINES + 1) : cur.slice()
      next.push({ line, stream: 'system' })
      return next
    })
  }, [])

  return { state, tasks, logs, start, stop, clearLogs, pushSystemLog }
}

function upsert(map: Map<string, Task>, email: string, fn: (t: Task) => Task): Map<string, Task> {
  const next = new Map(map)
  const cur = next.get(email) ?? { email, status: 'pending' as TaskStatus }
  next.set(email, fn(cur))
  return next
}
