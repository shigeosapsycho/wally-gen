import { useUpdaterCtx } from '../state/UpdaterContext'

export function UpdateBanner({ onStatus }: { onStatus: (s: string) => void }) {
  const { state, info, progress, error, download, apply } = useUpdaterCtx()

  if (state === 'idle' || state === 'checking' || state === 'up-to-date') return null

  if (state === 'available' && info) {
    return (
      <BannerRow tone="accent">
        <span className="text-sm">
          Version <strong className="font-semibold">v{info.latest}</strong> is available
          {info.size > 0 && (
            <span className="text-muted ml-1">({formatBytes(info.size)})</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-primary !py-1 !px-3 text-xs"
            onClick={() => {
              onStatus(`Downloading v${info.latest}…`)
              void download()
            }}
          >
            Download &amp; install
          </button>
        </div>
      </BannerRow>
    )
  }

  if (state === 'downloading') {
    const pct = progress && progress.total > 0
      ? Math.min(100, (progress.downloaded / progress.total) * 100)
      : null
    return (
      <BannerRow tone="accent">
        <span className="text-sm">
          Downloading {info ? `v${info.latest}` : 'update'}
          {progress && (
            <span className="text-muted ml-2 tabular-nums">
              {formatBytes(progress.downloaded)}
              {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
            </span>
          )}
        </span>
        <div className="w-48 h-1.5 rounded bg-card-2 overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: pct !== null ? `${pct}%` : '40%' }}
          />
        </div>
      </BannerRow>
    )
  }

  if (state === 'staged') {
    return (
      <BannerRow tone="emerald">
        <span className="text-sm">
          Update {info ? `v${info.latest}` : ''} is staged. Restart to apply.
        </span>
        <button
          type="button"
          className="btn-primary !py-1 !px-3 text-xs"
          onClick={() => {
            onStatus('Restarting…')
            void apply()
          }}
        >
          Restart now
        </button>
      </BannerRow>
    )
  }

  if (state === 'error' && error) {
    return (
      <BannerRow tone="red">
        <span className="text-sm">
          Updater error: <span className="text-red-300 font-mono text-xs">{error}</span>
        </span>
      </BannerRow>
    )
  }

  return null
}

function BannerRow({
  tone,
  children,
}: {
  tone: 'accent' | 'emerald' | 'red'
  children: React.ReactNode
}) {
  const bg =
    tone === 'accent'
      ? 'bg-accent/10 border-b-accent/30'
      : tone === 'emerald'
        ? 'bg-emerald-500/10 border-b-emerald-500/30'
        : 'bg-red-500/10 border-b-red-500/30'
  return (
    <div className={'shrink-0 h-9 px-4 flex items-center justify-between gap-4 border-b ' + bg}>
      {children}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
