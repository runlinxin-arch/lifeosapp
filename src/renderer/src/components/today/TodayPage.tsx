import { useEffect } from 'react'
import { TaskList } from './TaskList'
import { TodayCards } from './TodayCards'
import { useTasksStore } from '../../stores/tasksStore'
import { useToday } from '../../hooks/useToday'

export function TodayPage({ onJumpToSchedule }: { onJumpToSchedule?: () => void }): JSX.Element {
  const today = useToday()
  const load = useTasksStore((s) => s.load)
  // today 变化（跨零点）时自动切到新的一天
  useEffect(() => { void load(today) }, [load, today])
  return (
    <div className="h-full flex">
      <section className="w-[55%] p-4 border-r border-[var(--border)] overflow-auto">
        <h2 className="text-base font-bold mb-3">今日待办</h2>
        <TaskList onJumpToSchedule={onJumpToSchedule} />
      </section>
      <section className="flex-1 p-4 overflow-auto">
        <h2 className="text-base font-bold mb-3">今日概览</h2>
        <TodayCards />
      </section>
    </div>
  )
}
