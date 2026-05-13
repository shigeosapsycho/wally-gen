export function StatusBar({ text, warning }: { text: string; warning?: string }) {
  return (
    <div className="h-6 shrink-0 border-t border-border bg-bg flex items-center justify-between gap-4 px-4 text-xs">
      <span className="text-muted truncate">{text}</span>
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
  )
}
