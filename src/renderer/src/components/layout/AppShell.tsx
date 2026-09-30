import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  timeline: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, timeline, children }: AppShellProps): JSX.Element {
  return (
    <div className="h-full flex flex-col">
      <header className="relative min-h-[40px] shrink-0 border-b border-[var(--border)] bg-[var(--card)] flex items-center px-3">
        {timeline}
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--card)]">
          {sidebar}
        </aside>
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
