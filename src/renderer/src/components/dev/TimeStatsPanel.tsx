import { useMemo, useState } from 'react'
import { formatDuration } from '@shared/duration'
import { minutesByTask } from '@shared/devStats'
import { datePart, timePart } from '@shared/dates'
import { useDevStore } from '../../stores/devStore'

export function TimeStatsPanel({ projectId }: { projectId: number }): JSX.Element {
  const tasks = useDevStore((s) => s.tasks)
  const sessions = useDevStore((s) => s.sessions)
  const removeSession = useDevStore((s) => s.removeSession)
  const [showAll, setShowAll] = useState(false)

  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const projectSessions = useMemo(
    () => sessions.filter((s) => taskIds.has(s.task_id)).sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [sessions, taskIds]
  )
  const perTask = useMemo(() => minutesByTask(projectSessions), [projectSessions])
  const total = useMemo(() => projectSessions.reduce((sum, s) => sum + s.minutes, 0), [projectSessions])
  const peak = Math.max(1, ...tasks.map((t) => perTask.get(t.id) ?? 0))

  const rows = useMemo(
    () => tasks
      .map((t) => ({ task: t, minutes: perTask.get(t.id) ?? 0 }))
      .filter((r) => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes),
    [tasks, perTask]
  )

  const visibleSessions = showAll ? projectSessions : projectSessions.slice(0, 8)

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">项目累计</div>
          <div className="text-lg font-bold" style={{ color: '#3498db' }}>{formatDuration(total)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">计时记录</div>
          <div className="text-lg font-bold">{projectSessions.length} 条</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">有计时的任务</div>
          <div className="text-lg font-bold">{rows.length} / {tasks.length}</div>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
        <div className="text-[10px] text-[var(--muted)] mb-2">按任务汇总</div>
        {rows.map((r) => (
          <div key={r.task.id} className="mb-2">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex-1 truncate">{r.task.title}</span>
              <span className="text-[var(--muted)]">{formatDuration(r.minutes)}</span>
              <span className="text-[var(--muted)] w-10 text-right">
                {total > 0 ? Math.round((r.minutes / total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-[var(--border)] overflow-hidden">
              <div className="h-full" style={{ width: `${(r.minutes / peak) * 100}%`, background: '#3498db' }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-[10px] text-[var(--muted)] py-3 text-center">还没有计时记录</div>}
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="flex items-center mb-2">
          <span className="text-[10px] text-[var(--muted)]">最近计时记录</span>
          {projectSessions.length > 8 && (
            <button onClick={() => setShowAll(!showAll)} className="ml-auto text-[10px] text-[var(--accent)]">
              {showAll ? '只看最近 8 条' : `展开全部 ${projectSessions.length} 条`}
            </button>
          )}
        </div>

        {visibleSessions.map((s) => {
          const task = tasks.find((t) => t.id === s.task_id)
          return (
            <div key={s.id} className="flex items-center gap-2 py-1 border-b border-[var(--border)] last:border-0 text-[10px]">
              <span className="text-[var(--muted)] w-20 shrink-0">{datePart(s.started_at).slice(5)}</span>
              <span className="text-[var(--muted)] w-24 shrink-0">
                {timePart(s.started_at)}–{timePart(s.ended_at)}
              </span>
              <span className="flex-1 truncate">{task?.title ?? '（任务已删除）'}</span>
              <span>{formatDuration(s.minutes)}</span>
              <button
                onClick={() => void removeSession(s.id)}
                className="text-[var(--muted)] hover:text-red-400 px-1"
                title="删除这条记录"
              >✕</button>
            </div>
          )
        })}
        {visibleSessions.length === 0 && (
          <div className="text-[10px] text-[var(--muted)] py-3 text-center">还没有计时记录</div>
        )}
      </div>
    </div>
  )
}
