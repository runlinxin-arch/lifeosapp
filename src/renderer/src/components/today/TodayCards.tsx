import { useEffect, type ReactNode } from 'react'
import type { PageKey } from '../layout/Sidebar'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { useLearnStore } from '../../stores/learnStore'
import { useDevStore } from '../../stores/devStore'
import { useDevTimerStore } from '../../stores/devTimerStore'
import { diffDays } from '../../lib/dates'
import { useToday } from '../../hooks/useToday'
import { weekDays } from '@shared/layout'
import { progressPercent, sumMinutes } from '@shared/learnStats'
import { formatDuration } from '@shared/duration'
import { activeProjects, pickTodayLearnItems } from '@shared/todayCards'
import { projectWeekMinutes } from '@shared/devStats'
import { planForDate, workoutCount } from '@shared/fitnessStats'
import { MEAL_LABELS, MEAL_TYPES } from '@shared/dietContent'
import { dayNutrition, mealByType, recordedCount } from '@shared/dietStats'
import { useFitnessStore } from '../../stores/fitnessStore'
import { useDietStore } from '../../stores/dietStore'
import { STATUS_META as PROJECT_STATUS_META } from '../dev/ProjectList'
import { useModuleColors } from '../../hooks/useModuleColors'

function ModuleCard(props: {
  cardKey: string
  icon: string
  title: string
  accent?: string
  accentLabel?: string
  onOpen?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <div data-today-card={props.cardKey} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">{props.icon} {props.title}</span>
        {props.accent && props.accentLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${props.accent}22`, color: props.accent }}>
            {props.accentLabel}
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
  // 显式订阅「今天」：跨零点自动刷新，不依赖父组件重渲染的副作用
  const today = useToday()

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

  // 健身 / 饮食卡片同样按需加载（M4-4 接线）
  const fitPlans = useFitnessStore((s) => s.plans)
  const fitLogs = useFitnessStore((s) => s.logs)
  const fitSelected = useFitnessStore((s) => s.selectedPlanId)
  const fitLoad = useFitnessStore((s) => s.load)

  const meals = useDietStore((s) => s.meals)
  const dietLoad = useDietStore((s) => s.load)
  const mc = useModuleColors()

  useEffect(() => { void learnLoad() }, [learnLoad])
  useEffect(() => { void devLoad() }, [devLoad])
  useEffect(() => { void fitLoad() }, [fitLoad])
  useEffect(() => { void dietLoad() }, [dietLoad])

  const activeLongTasks = tasks.filter((t) => t.start_date <= today && t.end_date >= today)

  // ---- 学习卡片 ----
  const todayMinutes = sumMinutes(learnSessions, today, today)
  const shownItems = pickTodayLearnItems(learnItems, 3)
  const days = weekDays(today)
  const learningCount = learnItems.filter((i) => i.status === 'learning').length

  // ---- 开发卡片 ----
  const ongoing = activeProjects(projects)
  const weekOf = (pid: number): number => projectWeekMinutes(devSessions, allTasks, pid, days[0], days[6])

  // ---- 健身卡片（M4-4）----
  const activePlan = fitPlans.find((p) => p.id === fitSelected) ?? fitPlans[0] ?? null
  const todayPlanned = activePlan ? planForDate(activePlan.schedule, today) : null
  const weekWorkouts = workoutCount(fitLogs, days[0], days[6])
  const loggedToday = fitLogs.some((l) => l.date === today)

  // ---- 饮食卡片（M4-4）----
  const mealsRecorded = recordedCount(meals, today)
  const todayIntake = dayNutrition(meals, today)

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
        accent={mc.learning}
        accentLabel="学习"
        onOpen={onNavigate ? () => onNavigate('learning') : undefined}
      >
        <div className="flex items-center gap-3 text-xs mb-2">
          <span className="text-[var(--muted)]">今日已学</span>
          <span className="font-bold" style={{ color: mc.learning }}>{formatDuration(todayMinutes)}</span>
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
        accent={mc.dev}
        accentLabel="开发"
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

      <ModuleCard
        cardKey="fitness"
        icon="🏋️"
        title="健身"
        accent={mc.fitness}
        accentLabel="健身"
        onOpen={onNavigate ? () => onNavigate('fitness') : undefined}
      >
        <div className="flex items-center gap-3 text-xs mb-2">
          <span className="text-[var(--muted)]">今天该练</span>
          <span className="font-bold" style={{ color: mc.fitness }} data-fitness-planned={todayPlanned ?? ''}>
            {todayPlanned ?? '未安排'}
          </span>
          <span className="text-[var(--muted)] ml-auto" data-fitness-week-count={weekWorkouts}>
            本周 {weekWorkouts} 次
          </span>
        </div>

        {!activePlan && (
          <div className="text-xs text-[var(--muted)]">还没有训练计划，去「健身」建一个并编排一周安排</div>
        )}
        {activePlan && (
          <div className="text-[11px] text-[var(--muted)]">
            计划：{activePlan.name}
            {loggedToday ? ' · 今天已打卡' : todayPlanned ? ' · 尚未打卡' : ''}
          </div>
        )}
      </ModuleCard>

      <ModuleCard
        cardKey="diet"
        icon="🍚"
        title="饮食"
        accent={mc.diet}
        accentLabel="饮食"
        onOpen={onNavigate ? () => onNavigate('diet') : undefined}
      >
        <div className="flex items-center gap-3 text-xs mb-2">
          <span className="text-[var(--muted)]">今日摄入</span>
          <span className="font-bold" style={{ color: mc.diet }} data-diet-calories={todayIntake.calories}>
            {todayIntake.calories.toLocaleString()}
          </span>
          <span className="text-[10px] text-[var(--muted)]">kcal</span>
          <span className="text-[var(--muted)] ml-auto" data-diet-recorded={mealsRecorded}>
            已记录 {mealsRecorded}/4 餐
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {MEAL_TYPES.map((t) => {
            const logged = !!mealByType(meals, today, t)
            return (
              <div
                key={t}
                data-diet-meal={t}
                data-meal-logged={logged ? 'true' : 'false'}
                className="text-center text-[10px] py-1 rounded border"
                style={{
                  borderColor: logged ? mc.diet : 'var(--border)',
                  borderStyle: logged ? 'solid' : 'dashed',
                  color: logged ? mc.diet : 'var(--muted)'
                }}
              >
                <div>{MEAL_LABELS[t]}</div>
                <div>{logged ? '已记录' : '未记录'}</div>
              </div>
            )
          })}
        </div>
      </ModuleCard>
    </div>
  )
}
