import { useMemo, useState } from 'react'
import type { DevColumn, DevTask, Priority } from '@shared/types'
import { DEV_COLUMNS } from '@shared/kanban'
import { formatDuration } from '@shared/duration'
import { minutesByTask } from '@shared/devStats'
import { useDevStore } from '../../stores/devStore'
import { useDevTimerStore } from '../../stores/devTimerStore'

const COLUMN_LABEL: Record<DevColumn, string> = { todo: '待办', doing: '进行中', done: '已完成' }
const PRIORITY_DOT: Record<Priority, { color: string; label: string }> = {
  high: { color: '#e74c3c', label: '高' },
  mid: { color: '#f39c12', label: '中' },
  low: { color: '#8b8d98', label: '低' }
}

const DRAG_MIME = 'application/x-lifeos-devtask'

export function KanbanBoard({ projectId }: { projectId: number }): JSX.Element {
  const tasks = useDevStore((s) => s.tasks)
  const sessions = useDevStore((s) => s.sessions)
  const createTask = useDevStore((s) => s.createTask)
  const removeTask = useDevStore((s) => s.removeTask)
  const moveTask = useDevStore((s) => s.moveTask)

  const running = useDevTimerStore((s) => s.running)
  const startTimer = useDevTimerStore((s) => s.start)

  const [hover, setHover] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const logged = useMemo(() => minutesByTask(sessions), [sessions])
  const byColumn = useMemo(() => {
    const out: Record<DevColumn, DevTask[]> = { todo: [], doing: [], done: [] }
    for (const c of DEV_COLUMNS) {
      out[c] = tasks.filter((t) => t.column_name === c).sort((a, b) => a.position - b.position || a.id - b.id)
    }
    return out
  }, [tasks])

  const submit = async (column: DevColumn): Promise<void> => {
    const t = newTitle.trim()
    if (!t) return
    if (await createTask({ projectId, title: t, column })) setNewTitle('')
  }

  /**
   * 落点处理：从 dataTransfer 读任务 id，**不依赖组件状态**。
   * 组件状态会被 React 批处理，若 dragstart 与 drop 落在同一批次里会读到旧值。
   */
  const onDropAt = (e: React.DragEvent, column: DevColumn, index: number): void => {
    e.preventDefault()
    setHover(null)
    const raw = e.dataTransfer.getData(DRAG_MIME)
    const id = Number(raw)
    if (!raw || !Number.isInteger(id)) return
    void moveTask(id, column, index)
  }

  const clearDrag = (): void => setHover(null)

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit('todo') }}
          placeholder="新建任务，回车加入「待办」"
          className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DEV_COLUMNS.map((col) => (
          <div key={col} className="bg-[var(--card)]/40 border border-[var(--border)] rounded-lg p-2 min-h-[200px]">
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="text-xs font-medium">{COLUMN_LABEL[col]}</span>
              <span className="text-[10px] text-[var(--muted)]">{byColumn[col].length}</span>
            </div>

            {byColumn[col].map((t, i) => (
              <div key={t.id}>
                <DropZone
                  column={col}
                  index={i}
                  active={hover === `${col}:${i}`}
                  onEnter={() => setHover(`${col}:${i}`)}
                  onLeave={() => setHover(null)}
                  onDrop={(e) => onDropAt(e, col, i)}
                />
                <TaskCard
                  task={t}
                  minutes={logged.get(t.id) ?? 0}
                  running={running?.taskId === t.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, String(t.id))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={clearDrag}
                  onStartTimer={() => startTimer(t.id, t.title)}
                  onMove={(to) => void moveTask(t.id, to, 9999)}
                  onDelete={() => void removeTask(t.id)}
                />
              </div>
            ))}

            <DropZone
              column={col}
              index={byColumn[col].length}
              active={hover === `${col}:end`}
              onEnter={() => setHover(`${col}:end`)}
              onLeave={() => setHover(null)}
              onDrop={(e) => onDropAt(e, col, byColumn[col].length)}
            />

            {byColumn[col].length === 0 && (
              <div className="text-[10px] text-[var(--muted)] text-center py-4">拖到这里</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-[var(--muted)]">
        拖动卡片可跨列或列内排序；也可以点卡片上的「移动到…」选择目标列（效果等价）。
      </div>
    </div>
  )
}

function DropZone(props: {
  column: DevColumn
  index: number
  active: boolean
  onEnter: () => void
  onLeave: () => void
  onDrop: (e: React.DragEvent) => void
}): JSX.Element {
  return (
    <div
      data-dropzone={`${props.column}:${props.index}`}
      onDragOver={(e) => { e.preventDefault(); props.onEnter() }}
      onDragLeave={props.onLeave}
      onDrop={props.onDrop}
      className="rounded transition-all"
      style={{
        height: props.active ? 22 : 8,
        background: props.active ? 'var(--accent)' : 'transparent',
        opacity: props.active ? 0.35 : 1
      }}
    />
  )
}

function TaskCard(props: {
  task: DevTask
  minutes: number
  running: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onStartTimer: () => void
  onMove: (to: DevColumn) => void
  onDelete: () => void
}): JSX.Element {
  const { task } = props
  const dot = PRIORITY_DOT[task.priority]

  return (
    <div
      draggable
      data-devcard={task.id}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      className={`group rounded-lg border px-2 py-1.5 mb-0.5 cursor-grab active:cursor-grabbing ${
        props.running ? 'border-[#3498db] bg-[#3498db1a]' : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: dot.color }} title={`优先级 ${dot.label}`} />
        <span className="flex-1 text-xs break-words">{task.title}</span>
        <button
          onClick={props.onDelete}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-[var(--muted)] hover:text-red-400"
          title="删除任务"
        >✕</button>
      </div>

      <div className="mt-1 flex items-center gap-2 text-[9px] text-[var(--muted)]">
        {task.due_date && <span>截止 {task.due_date.slice(5)}</span>}
        {props.minutes > 0 && <span>已计 {formatDuration(props.minutes)}</span>}
        {props.running && <span style={{ color: '#3498db' }}>计时中</span>}
      </div>

      <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100">
        {!props.running && (
          <button
            onClick={props.onStartTimer}
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: '#3498db', color: '#fff' }}
          >开始计时</button>
        )}
        <select
          value=""
          onChange={(e) => { if (e.target.value) props.onMove(e.target.value as DevColumn) }}
          className="text-[9px] bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 outline-none"
          title="移动到…"
        >
          <option value="">移动到…</option>
          {DEV_COLUMNS.filter((c) => c !== task.column_name).map((c) => (
            <option key={c} value={c}>{COLUMN_LABEL[c]}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
