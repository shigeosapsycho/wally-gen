import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ConfirmOptions = {
  title?: string
  /** `'warning'` styles the OK button red and shows a warning glyph beside the
   *  title. Use it for destructive actions (clear, leave-without-saving). */
  kind?: 'warning' | 'info'
  okLabel?: string
  cancelLabel?: string
}

type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>

type Pending = {
  message: string
  options: ConfirmOptions
}

const ConfirmCtx = createContext<Confirm | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const okBtnRef = useRef<HTMLButtonElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  // Promise resolver lives in a ref, not in state, so the state updater stays
  // pure (React 18 Strict Mode double-invokes updaters).
  const pendingResolveRef = useRef<((ok: boolean) => void) | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const confirm = useCallback<Confirm>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      previousFocusRef.current = (document.activeElement as HTMLElement) ?? null
      pendingResolveRef.current = resolve
      setPending({ message, options })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    const resolve = pendingResolveRef.current
    pendingResolveRef.current = null
    setPending(null)
    resolve?.(ok)
    // Restore focus to wherever it was before the dialog opened, once the
    // portal has unmounted.
    queueMicrotask(() => {
      previousFocusRef.current?.focus?.()
      previousFocusRef.current = null
    })
  }, [])

  useEffect(() => {
    if (!pending) return
    // Match ask()'s default — affirmative button focused, Enter confirms.
    okBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, close])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <Dialog
            pending={pending}
            okBtnRef={okBtnRef}
            cancelBtnRef={cancelBtnRef}
            onConfirm={() => close(true)}
            onCancel={() => close(false)}
          />,
          document.body,
        )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm(): Confirm {
  const v = useContext(ConfirmCtx)
  if (!v) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return v
}

function Dialog({
  pending,
  okBtnRef,
  cancelBtnRef,
  onConfirm,
  onCancel,
}: {
  pending: Pending
  okBtnRef: React.RefObject<HTMLButtonElement>
  cancelBtnRef: React.RefObject<HTMLButtonElement>
  onConfirm: () => void
  onCancel: () => void
}) {
  const { message, options } = pending
  const isWarning = options.kind === 'warning'
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative card max-w-[520px] w-[90%] shadow-2xl"
      >
        <div className="px-6 pt-5 pb-3 flex items-center gap-2.5">
          {isWarning && <WarningGlyph />}
          <h2
            id="confirm-title"
            className="text-base font-semibold tracking-tight text-text"
          >
            {options.title ?? 'Confirm'}
          </h2>
        </div>
        <div className="px-6 pb-5 text-sm text-text/85 whitespace-pre-wrap">
          {message}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="btn-secondary !py-1.5 !px-4 text-sm"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={okBtnRef}
            type="button"
            onClick={onConfirm}
            className={
              isWarning
                ? '!py-1.5 !px-4 text-sm rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-medium transition-colors'
                : 'btn-primary !py-1.5 !px-4 text-sm'
            }
          >
            {options.okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WarningGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-500 shrink-0"
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
