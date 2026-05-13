import { useEffect, useRef } from 'react'

/**
 * Calls `save(value)` after the value stops changing for `delayMs` ms.
 * Skips the very first invocation (which would just save the loaded-from-disk
 * value back over itself).
 */
export function useDebouncedSave<T>(
  value: T,
  save: (v: T) => void | Promise<void>,
  delayMs = 500,
) {
  const isFirst = useRef(true)
  const latest = useRef(save)
  latest.current = save

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const handle = window.setTimeout(() => {
      void latest.current(value)
    }, delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])
}
