import { getCurrentWindow } from '@tauri-apps/api/window'

const VERSION = '1.3.1'

export function TitleBar() {
  const win = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center pl-4 pr-1 select-none border-b border-border bg-bg"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5 pointer-events-none">
        <Diamond />
        <span className="text-text font-semibold text-[15px] tracking-tight">Wally Gen</span>
        <span className="text-muted text-xs">v{VERSION}</span>
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex items-center">
        <WinButton onClick={() => win.minimize()} aria-label="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4.5" width="10" height="1" fill="currentColor" /></svg>
        </WinButton>
        <WinButton onClick={() => win.toggleMaximize()} aria-label="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none" /></svg>
        </WinButton>
        <WinButton onClick={() => win.close()} aria-label="Close" close>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" /></svg>
        </WinButton>
      </div>
    </div>
  )
}

function WinButton({
  onClick,
  children,
  close,
  ...rest
}: React.PropsWithChildren<{ onClick: () => void; close?: boolean } & React.AriaAttributes>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-10 w-12 inline-flex items-center justify-center text-muted hover:text-text transition-colors ' +
        (close ? 'hover:bg-red-600 hover:!text-white' : 'hover:bg-card-2')
      }
      {...rest}
    >
      {children}
    </button>
  )
}

function Diamond() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="text-accent">
      <rect
        x="2"
        y="2"
        width="14"
        height="14"
        rx="3"
        transform="rotate(45 9 9)"
        fill="currentColor"
      />
    </svg>
  )
}
