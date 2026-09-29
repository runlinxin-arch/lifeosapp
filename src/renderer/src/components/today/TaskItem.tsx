import type { Task } from '@shared/types'

const PRIORITY_DOT: Record<string, string> = { high: '#e74c3c', mid: '#f39c12', low: '#8b8d98' }

export function TaskItem({ task, onToggle, onRemove }: {
  task: Task
  onToggle: (id: number) => void
  onRemove: (id: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] group">
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} className="accent-[#7c8cff]" />
      <span className={`flex-1 text-sm ${task.done ? 'line-through text-[var(--muted)]' : ''}`}>{task.title}</span>
      {task.source_module && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">日程</span>}
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY_DOT[task.priority] }} />
      <button onClick={() => onRemove(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-400 text-xs">✕</button>
    </div>
  )
}
