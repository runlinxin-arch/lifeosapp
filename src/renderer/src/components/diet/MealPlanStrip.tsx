import type { Meal, MealPlan } from '@shared/types'
import { plannedCount, recordedCount, upcomingDays } from '@shared/dietStats'
import { formatCn, weekdayCn } from '@shared/dates'

const DAYS = 14
const AMBER = '#f39c12'

/** 饮食计划横条：今天起 14 天，显示每天已记录餐数与已编排计划数，点击切换查看日期 */
export function MealPlanStrip({ today, date, meals, plans, onSelect }: {
  today: string
  date: string
  meals: Meal[]
  plans: MealPlan[]
  onSelect: (date: string) => void
}): JSX.Element {
  const days = upcomingDays(today, DAYS)

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 mb-3" data-plan-strip>
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span className="text-[11px] font-bold">🗓 饮食计划横条</span>
        <span className="text-[9px] text-[var(--muted)]">点某天可提前编排（未来 14 天）</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {days.map((d) => {
          const recorded = recordedCount(meals, d)
          const planned = plannedCount(plans, d)
          const selected = d === date
          const isToday = d === today
          return (
            <button
              key={d}
              data-plan-day={d}
              data-day-recorded={recorded}
              data-day-planned={planned}
              data-day-selected={selected ? 'true' : 'false'}
              onClick={() => onSelect(d)}
              className="shrink-0 w-[68px] rounded px-1 py-1 text-center border transition-colors"
              style={{
                background: selected ? 'rgba(243,156,18,0.18)' : 'var(--bg)',
                borderColor: selected ? AMBER : 'var(--border)',
                outline: isToday && !selected ? '1px solid var(--accent)' : 'none'
              }}
              title={`${d} ${recorded} 餐已记录 / ${planned} 餐已编排`}
            >
              <div className="text-[10px] font-bold">{formatCn(d)}</div>
              <div className="text-[9px] text-[var(--muted)]">{isToday ? '今天' : weekdayCn(d)}</div>
              <div className="text-[9px] mt-0.5" style={{ color: recorded ? AMBER : 'var(--muted)' }}>
                {recorded} 餐
              </div>
              <div className="text-[9px]" style={{ color: planned ? 'var(--accent)' : 'var(--muted)' }}>
                {planned} 计划
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
