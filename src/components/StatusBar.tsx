export function StatusBar({
  text,
  warning,
  successCount,
  failCount,
}: {
  text: string
  warning?: string
  successCount: number
  failCount: number
}) {
  const showCounts = successCount > 0 || failCount > 0
  return (
    <div className="h-6 shrink-0 border-t border-border bg-bg flex items-center justify-between gap-4 px-4 text-xs">
      <span className="text-muted truncate">{text}</span>
      <div className="flex items-center gap-5">
        {showCounts && (
          <span className="font-mono tabular-nums tracking-[0.08em] whitespace-nowrap">
            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
              {successCount.toLocaleString()}
            </span>
            <span className="text-muted ml-1.5">SUCCESS</span>
            <span className="text-muted/60 mx-2">·</span>
            <span className="text-red-700 dark:text-red-400 font-bold">
              {failCount.toLocaleString()}
            </span>
            <span className="text-muted ml-1.5">FAIL</span>
          </span>
        )}
        {warning && (
          <span
            className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold tracking-[0.08em] uppercase whitespace-nowrap"
            role="status"
            aria-live="polite"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {warning}
          </span>
        )}
      </div>
    </div>
  )
}
