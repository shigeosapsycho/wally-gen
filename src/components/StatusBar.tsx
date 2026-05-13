export function StatusBar({ text }: { text: string }) {
  return (
    <div className="h-6 shrink-0 border-t border-border bg-bg flex items-center px-4 text-xs text-muted">
      {text}
    </div>
  )
}
