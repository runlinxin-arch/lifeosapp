import { useState } from 'react'
import type { Priority } from '@shared/types'
import { TaskItem } from './TaskItem'
import { useTasksStore } from '../../stores/tasksStore'

export function TaskList(): JSX.Element {
  const { tasks, add, toggle, remove } = useTasksStore()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) return
    await add(t, priority)
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="添加今日待办，回车确认"
          className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-2 text-sm text-[var(--muted)]">
          <option value="low">低</option>
          <option value="mid">中</option>
          <option value="high">高</option>
        </select>
      </div>
      {tasks.map((t) => <TaskItem key={t.id} task={t} onToggle={toggle} onRemove={remove} />)}
      {tasks.length === 0 && <div className="text-center text-[var(--muted)] text-sm py-8">今天还没有待办，加一个吧</div>}
    </div>
  )
}
