import { useEffect, useState } from 'react'
import type { ProjectStatus } from '@shared/types'
import { useDevStore } from '../../stores/devStore'
import { useDevTimerStore } from '../../stores/devTimerStore'
import { useToday } from '../../hooks/useToday'
import { weekDays } from '@shared/layout'
import { projectWeekMinutes } from '@shared/devStats'
import { formatDuration } from '@shared/duration'
import { KanbanBoard } from './KanbanBoard'
import { DevTimer } from './DevTimer'

type Tab = 'board' | 'bugs' | 'time'

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '开发中' },
  { value: 'paused', label: '暂停' },
  { value: 'done', label: '已完成' }
]

export function ProjectDetail({ projectId }: { projectId: number }): JSX.Element | null {
  const projects = useDevStore((s) => s.projects)
  const stats = useDevStore((s) => s.stats)
  const sessions = useDevStore((s) => s.sessions)
  const allTasks = useDevStore((s) => s.allTasks)
  const bugs = useDevStore((s) => s.bugs)
  const updateProject = useDevStore((s) => s.updateProject)
  const removeProject = useDevStore((s) => s.removeProject)
  const selectProject = useDevStore((s) => s.selectProject)
  const cancelTimer = useDevTimerStore((s) => s.cancel)
  const today = useToday()
  const [tab, setTab] = useState<Tab>('board')

  const project = projects.find((p) => p.id === projectId)

  // 切换项目时回到看板页签，并丢弃上一个项目的计时
  useEffect(() => { setTab('board'); cancelTimer() }, [projectId, cancelTimer])

  if (!project) return <div className="text-xs text-[var(--muted)]">项目不存在</div>

  const st = stats.get(project.id) ?? { taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 }
  const days = weekDays(today)
  const weekMinutes = projectWeekMinutes(sessions, allTasks, project.id, days[0], days[6])
  const openBugs = bugs.filter((b) => b.status !== 'fixed').length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'board', label: '看板' },
    { key: 'bugs', label: 'Bug', badge: openBugs },
    { key: 'time', label: '计时统计' }
  ]

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-bold truncate">{project.name}</h2>
        <select
          value={project.status}
          onChange={(e) => { void updateProject(project.id, { status: e.target.value as ProjectStatus }) }}
          className="text-[10px] bg-[var(--card)] border border-[var(--border)] rounded px-1.5 py-1 outline-none"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-[10px] text-[var(--muted)]">
          本周 {formatDuration(weekMinutes)} · 累计 {formatDuration(st.minutes)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DevTimer />
          <button
            onClick={() => { cancelTimer(); void removeProject(project.id) }}
            className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300"
          >删除项目</button>
          <button
            onClick={() => void selectProject(null)}
            className="text-[10px] px-2 py-1 rounded bg-[var(--border)]"
          >返回列表</button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 ${
              tab === t.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]'
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="text-[9px] px-1 rounded bg-red-500/30 text-red-200">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'board' && <KanbanBoard projectId={project.id} />}
      {tab === 'bugs' && (
        <div className="text-xs text-[var(--muted)]">Bug 页签将在 Task 9 实现</div>
      )}
      {tab === 'time' && (
        <div className="text-xs text-[var(--muted)]">计时统计页签将在 Task 10 实现</div>
      )}
    </div>
  )
}
