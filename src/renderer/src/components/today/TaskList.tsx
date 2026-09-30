import { useState } from 'react'
import type { Priority, Task } from '@shared/types'
import { TaskItem } from './TaskItem'
import { useTasksStore } from '../../stores/tasksStore'
import { ConvertDialog } from '../schedule/ConvertDialog'

export function TaskList({ onJumpToSchedule }: { onJumpToSchedule?: () => void }): JSX.Element {
  const { tasks, error, clearError, add, toggle, remove, convert } = useTasksStore()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')
  const [converting, setConverting] = useState<Task | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) return
    // 只有成功才清空输入，失败时保留用户已经敲进去的内容
    if (await add(t, priority)) setTitle('')
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]" title="关闭">✕</button>
        </div>
      )}
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

      {tasks.map((t) => (
        <div
          key={t.id}
          draggable={t.source_module !== 'event'}
          onDragStart={(e) => e.dataTransfer.setData('text/lifeos-task', JSON.stringify({ id: t.id, title: t.title }))}
        >
          <TaskItem
            task={t}
            onToggle={toggle}
            onRemove={remove}
            onConvert={setConverting}
            onJump={() => onJumpToSchedule?.()}
          />
        </div>
      ))}

      {tasks.length === 0 && <div className="text-center text-[var(--muted)] text-sm py-8">今天还没有待办，加一个吧</div>}

      <ConvertDialog
        task={converting ? { id: converting.id, title: converting.title, date: converting.date } : null}
        onClose={() => setConverting(null)}
        onSubmit={async (startAt, endAt) => {
          if (!converting) return
          const ok = await convert(converting.id, { startAt, endAt, location: null, note: null, remindMinutes: 15 })
          if (ok) setConverting(null)
          else throw new Error('转换失败，请重试')
        }}
      />
    </div>
  )
}
