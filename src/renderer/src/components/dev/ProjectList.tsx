import { useMemo } from 'react'
import type { Project, ProjectStatus } from '@shared/types'
import { formatDuration } from '@shared/duration'
import { weekDays } from '@shared/layout'
import { projectWeekMinutes } from '@shared/devStats'
import { useDevStore } from '../../stores/devStore'
import { useToday } from '../../hooks/useToday'
import type { ProjectStats } from '../../lib/ipc'

/** 状态灯配色：计划中琥珀 / 开发中绿 / 暂停与已完成灰 */
export const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  planned: { label: '计划中', color: '#f39c12' },
  in_progress: { label: '开发中', color: '#4ade80' },
  paused: { label: '暂停', color: '#8b8d98' },
  done: { label: '已完成', color: '#8b8d98' }
}

export function ProjectCard({ project }: { project: Project }): JSX.Element {
  const stats = useDevStore((s) => s.stats)
  const sessions = useDevStore((s) => s.sessions)
  const allTasks = useDevStore((s) => s.allTasks)
  const selectedProjectId = useDevStore((s) => s.selectedProjectId)
  const selectProject = useDevStore((s) => s.selectProject)
  const today = useToday()

  const meta = STATUS_META[project.status]
  const st: ProjectStats = stats.get(project.id) ?? { taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 }
  const pct = st.taskTotal > 0 ? Math.round((st.taskDone / st.taskTotal) * 100) : 0

  const days = useMemo(() => weekDays(today), [today])
  const weekMinutes = useMemo(
    () => projectWeekMinutes(sessions, allTasks, project.id, days[0], days[6]),
    [sessions, allTasks, project.id, days]
  )

  const active = project.id === selectedProjectId

  return (
    <button
      onClick={() => void selectProject(active ? null : project.id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg border mb-2 ${
        active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} title={meta.label} />
        <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
        <span className="text-[10px] text-[var(--muted)]">{meta.label}</span>
      </div>

      {project.description && (
        <div className="mt-1 text-[10px] text-[var(--muted)] truncate">{project.description}</div>
      )}

      <div className="mt-2 h-1.5 rounded bg-[var(--border)] overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: '#3498db' }} />
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--muted)]">
        <span>{st.taskTotal > 0 ? `${st.taskDone}/${st.taskTotal} 任务 · ${pct}%` : '暂无任务'}</span>
        <span>本周 {formatDuration(weekMinutes)}</span>
        <span className={st.openBugs > 0 ? 'text-red-300' : ''}>未修 Bug {st.openBugs}</span>
        <span className="ml-auto">累计 {formatDuration(st.minutes)}</span>
      </div>
    </button>
  )
}

export function ProjectList(): JSX.Element {
  const projects = useDevStore((s) => s.projects)
  if (projects.length === 0) {
    return <div className="text-center text-[var(--muted)] text-sm py-8">还没有项目，新建一个吧</div>
  }
  return <>{projects.map((p) => <ProjectCard key={p.id} project={p} />)}</>
}
