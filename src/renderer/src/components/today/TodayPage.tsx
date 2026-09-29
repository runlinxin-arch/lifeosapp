import { useEffect } from 'react'
import { TaskList } from './TaskList'
import { TodayCards } from './TodayCards'
import { useTasksStore } from '../../stores/tasksStore'
import { todayStr } from '../../lib/dates'

export function TodayPage(): JSX.Element {
  const load = useTasksStore((s) => s.load)
  useEffect(() => { void load(todayStr()) }, [load])
  return (
    <div className="h-full flex">
      <section className="w-[55%] p-4 border-r border-[var(--border)] overflow-auto">
        <h2 className="text-base font-bold mb-3">今日待办</h2>
        <TaskList />
      </section>
      <section className="flex-1 p-4 overflow-auto">
        <h2 className="text-base font-bold mb-3">今日概览</h2>
        <TodayCards />
      </section>
    </div>
  )
}
