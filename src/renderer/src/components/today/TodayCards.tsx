import { useEffect, type ReactNode } from 'react'
import type { PageKey } from '../layout/Sidebar'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { useLearnStore } from '../../stores/learnStore'
import { useDevStore } from '../../stores/devStore'
import { useDevTimerStore } from '../../stores/devTimerStore'
import { todayStr, diffDays } from '../../lib/dates'
import { weekDays } from '@shared/layout'
import { progressPercent, sumMinutes } from '@shared/learnStats'
import { formatDuration } from '@shared/duration'
import { activeProjects, pickTodayLearnItems } from '@shared/todayCards'
import { projectWeekMinutes } from '@shared/devStats'
import { STATUS_META as PROJECT_STATUS_META } from '../dev/ProjectList'

function ModuleCard(props: {
  cardKey: string
  icon: string
  title: string
  accent?: string
  onOpen?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <div data-today-card={props.cardKey} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">{props.icon} {props.title}</span>
        {props.accent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${props.accent}22`, color: props.accent }}>
            {props.accent === '#4ade80' ? '学习' : '开发'}
          </span>
        )}
        {props.onOpen && (
          <button
            onClick={props.onOpen}
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
          >进入模块 →</button>
        )}
      </div>
      {props.children}
    </div>
  )
}

export function TodayCards({ onNavigate }: { onNavigate?: (page: PageKey) => void }): JSX.Element {
  const { tasks } = useLongTasksStore()
  const today = todayStr()

  // 今日卡片需要学习与开发的数据，进入「今天」页时按需加载一次
  const learnLoad = useLearnStore((s) => s.load)
  const learnItems = useLearnStore((s) => s.items)
  const learnSessions = useLearnStore((s) => s.sessions)

  const devLoad = useDevStore((s) => s.load)
  const projects = useDevStore((s) => s.projects)
  const stats = useDevStore((s) => s.stats)
  const allTasks = useDevStore((s) => s.allTasks)
  const devSessions = useDevStore((s) => s.sessions)
  const running = useDevTimerStore((s) => s.running)

  useEffect(() => { void learnLoad() }, [learnLoad])
  useEffect(() => { void devLoad() }, [devLoad])

  const activeLongTasks = tasks.filter((t) => t.start_date <= today && t.end_date >= today)

  // ---- 学习卡片 ----
  const todayMinutes = sumMinutes(learnSessions, today, today)
  const shownItems = pickTodayLearnItems(learnItems, 3)
  const days = weekDays(today)
  const learningCount = learnItems.filter((i) => i.status === 'learning').length

  // ---- 开发卡片 ----
  const ongoing = activeProjects(projects)
  const weekOf = (pid: number): number => projectWeekMinutes(devSessions, allTasks, pid, days[0], days[6])

  return (
    <div>
      <ModuleCard cardKey="longtasks" icon="🗓️" title="长期任务">
        {activeLongTasks.length === 0 && <div className="text-xs text-[var(--muted)]">暂无进行中的长期任务</div>}
        {activeLongTasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-xs py-1">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
            <span className="flex-1">{t.title}</span>
            <span className="text-[var(--muted)]">剩 {Math.max(0, diffDays(t.end_date, today))} 天</span>
          </div>
        ))}
      </ModuleCard>

      <ModuleCard
        cardKey="learning"
        icon="📖"
        title="自我学习"
        accent="#4ade80"
        onOpen={onNavigate ? () => onNavigate('learning') : undefined}
      >
        <div className="flex items-center gap-3 text-xs mb-2">
          <span className="text-[var(--muted)]">今日已学</span>
          <span className="font-bold" style={{ color: '#4ade80' }}>{formatDuration(todayMinutes)}</span>
          {learningCount > 0 && (
            <span className="text-[var(--muted)]">· 学习中 {learningCount} 项</span>
          )}
        </div>

        {shownItems.length === 0 && (
          <div className="text-xs text-[var(--muted)]">还没有学习项，去「自我学习」加一个</div>
        )}
        {shownItems.map((it) => {
          const pct = progressPercent(it)
          return (
            <div key={it.id} className="py-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{it.title}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {it.total_units > 0 ? `${it.done_units}/${it.total_units}` : '未设目标'}
                </span>
              </div>
              <div className="mt-1 h-1 rounded bg-[var(--border)] overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: '#4ade80' }} />
              </div>
            </div>
          )
        })}
      </ModuleCard>

      <ModuleCard
        cardKey="dev"
        icon="💻"
        title="开发"
        accent="#3498db"
        onOpen={onNavigate ? () => onNavigate('dev') : undefined}
      >
        {running && (
          <div className="flex items-center gap-2 text-xs mb-2 px-2 py-1 rounded" style={{ background: '#3498db1a' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#3498db' }} />
            <span className="flex-1 truncate">计时中：{running.taskTitle}</span>
          </div>
        )}

        {ongoing.length === 0 && (
          <div className="text-xs text-[var(--muted)]">暂无进行中的项目</div>
        )}
        {ongoing.map((p) => {
          const st = stats.get(p.id) ?? { taskTotal: 0, taskDone: 0, openBugs: 0, minutes: 0 }
          const meta = PROJECT_STATUS_META[p.status]
          return (
            <div key={p.id} className="py-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {st.taskTotal > 0 ? `${st.taskDone}/${st.taskTotal} 任务` : '暂无任务'}
                </span>
                {st.openBugs > 0 && <span className="text-[10px] text-red-300">Bug {st.openBugs}</span>}
              </div>
              <div className="mt-0.5 text-[9px] text-[var(--muted)]">本周 {formatDuration(weekOf(p.id))}</div>
            </div>
          )
        })}
      </ModuleCard>

      <ModuleCard cardKey="fitness" icon="🏋️" title="健身">
        <div className="text-xs text-[var(--muted)]">健身模块将在 M4 接入</div>
      </ModuleCard>
      <ModuleCard cardKey="diet" icon="🍚" title="饮食">
        <div className="text-xs text-[var(--muted)]">饮食模块将在 M4 接入</div>
      </ModuleCard>
    </div>
  )
}
