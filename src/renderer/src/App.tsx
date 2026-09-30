import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Sidebar, type PageKey } from './components/layout/Sidebar'
import { TimelineBar } from './components/layout/TimelineBar'
import { TodayPage } from './components/today/TodayPage'
import { SchedulePage } from './components/schedule/SchedulePage'

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('today')
  return (
    <AppShell
      sidebar={<Sidebar active={page} onNavigate={setPage} />}
      timeline={<TimelineBar />}
    >
      {page === 'today'
        ? <TodayPage />
        : page === 'schedule'
          ? <SchedulePage />
          : <div className="p-4 text-[var(--muted)]">该模块将在后续里程碑开放</div>}
    </AppShell>
  )
}
