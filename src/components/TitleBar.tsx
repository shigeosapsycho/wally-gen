import { getCurrentWindow } from '@tauri-apps/api/window'
import { useThemeCtx } from '../state/ThemeContext'

const VERSION = '1.4.2'

export function TitleBar() {
  const win = getCurrentWindow()
  const { effective, toggle } = useThemeCtx()

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
        <button
          type="button"
          onClick={toggle}
          aria-label={effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-10 w-10 inline-flex items-center justify-center text-muted hover:text-text hover:bg-card-2 transition-colors"
        >
          {effective === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
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

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
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
        // The close button sits at the top-right of a Windows 11 window that
        // DWM rounds with an 8px radius. Match that on the hover background
        // so the red doesn't spill past the chrome's rounded corner.
        (close
          ? 'hover:bg-red-600 hover:!text-white rounded-tr-lg'
          : 'hover:bg-card-2')
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
