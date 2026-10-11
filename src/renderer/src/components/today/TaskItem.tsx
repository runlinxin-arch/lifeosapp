import type { Task, TaskSource } from '@shared/types'

const PRIORITY_DOT: Record<string, string> = { high: '#e74c3c', mid: '#f39c12', low: '#8b8d98' }
const SOURCE_LABEL: Record<string, string> = { event: '日程' }

export function TaskItem({ task, onToggle, onRemove, onConvert, onJump }: {
  task: Task
  onToggle: (id: number) => void
  onRemove: (id: number) => void
  onConvert?: (task: Task) => void
  onJump?: (task: Task) => void
}): JSX.Element {
  const fromEvent = task.source_module === 'event'
  const sourceLabel = task.source_module ? (SOURCE_LABEL[task.source_module] ?? task.source_module) : ''

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] group">
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} className="accent-[var(--accent)]" />
      <span className={`flex-1 text-sm ${task.done ? 'line-through text-[var(--muted)]' : ''}`}>{task.title}</span>

      {fromEvent ? (
        // 日程来源行由事件接管：不可删除、不显示优先级，只保留勾选与跳转
        <button
          onClick={() => onJump?.(task)}
          title="跳到日程"
          className="text-[10px] px-1.5 py-0.5 rounded border border-[#7c8cff]/50 text-[#7c8cff] hover:bg-[#7c8cff]/10"
        >{sourceLabel} ↗</button>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY_DOT[task.priority] }} />
          <button
            onClick={() => onConvert?.(task)}
            title="转为日程"
            className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--accent)] text-xs"
          >转日程</button>
          <button
            onClick={() => onRemove(task.id)}
            className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-400 text-xs"
          >✕</button>
        </>
      )}
    </div>
  )
}

export function isEventSourced(task: Task): boolean {
  return (task.source_module as TaskSource | null) === 'event'
}
