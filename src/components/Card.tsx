import type { ReactNode } from 'react'

export function Card({
  title,
  badge,
  children,
  className = '',
}: {
  title?: ReactNode
  badge?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={'card flex flex-col ' + className}>
      {(title || badge) && (
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">
            {title}
          </h2>
          {badge}
        </header>
      )}
      {children}
    </section>
  )
}

export function CountBadge({ count }: { count: number }) {
  return <span className="pill tabular-nums">{count.toLocaleString()}</span>
}
