import { useMemo, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Sidebar, type PageKey } from './components/layout/Sidebar'
import { TimelineBar } from './components/layout/TimelineBar'
import { TodayPage } from './components/today/TodayPage'
import { SchedulePage } from './components/schedule/SchedulePage'
import { LearnPage } from './components/learn/LearnPage'
import { DevPage } from './components/dev/DevPage'
import { InspirationPage } from './components/inspiration/InspirationPage'
import { FitnessPage } from './components/fitness/FitnessPage'
import { DietPage } from './components/diet/DietPage'

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('today')

  const content = useMemo(() => {
    switch (page) {
      case 'today':
        return <TodayPage onJumpToSchedule={() => setPage('schedule')} onNavigate={setPage} />
      case 'schedule':
        return <SchedulePage />
      case 'learning':
        return <LearnPage />
      case 'dev':
        return <DevPage />
      case 'inspiration':
        return <InspirationPage />
      case 'fitness':
        return <FitnessPage />
      case 'diet':
        return <DietPage />
      default:
        return <div className="p-4 text-[var(--muted)]">该模块将在后续里程碑开放</div>
    }
  }, [page])

  return (
    <AppShell
      sidebar={<Sidebar active={page} onNavigate={setPage} />}
      timeline={<TimelineBar />}
    >
      {content}
    </AppShell>
  )
}
