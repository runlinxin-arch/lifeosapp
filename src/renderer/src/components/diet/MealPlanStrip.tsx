import { useState } from 'react'
import type { Meal, MealPlan } from '@shared/types'
import { plannedCount, recordedCount, upcomingDays } from '@shared/dietStats'
import { addDays, formatCn, weekdayCn } from '@shared/dates'
import { useModuleColors } from '../../hooks/useModuleColors'

const DAYS = 7

/** 饮食计划横条：今天起 7 天一个视口，‹ › 左右翻页（每页 ±7 天），点击某天切换查看日期 */
export function MealPlanStrip({ today, date, meals, plans, onSelect }: {
  today: string
  date: string
  meals: Meal[]
  plans: MealPlan[]
  onSelect: (date: string) => void
}): JSX.Element {
  const [page, setPage] = useState(0)
  const mc = useModuleColors()
  const start = addDays(today, page * DAYS)
  const days = upcomingDays(start, DAYS)

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 mb-3" data-plan-strip>
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span className="text-[11px] font-bold">🗓 饮食计划横条</span>
        <span className="text-[9px] text-[var(--muted)]">点某天可提前编排（每页 7 天）</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            data-plan-prev
            onClick={() => setPage((p) => p - 1)}
            className="text-xs w-6 h-6 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)]"
            title="上一页（过去 7 天）"
          >‹</button>
          {page !== 0 && (
            <button
              data-plan-today
              onClick={() => setPage(0)}
              className="text-[10px] px-2 h-6 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--accent)]"
              title="回到今天"
            >今天</button>
          )}
          <button
            data-plan-next
            onClick={() => setPage((p) => p + 1)}
            className="text-xs w-6 h-6 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)]"
            title="下一页（未来 7 天）"
          >›</button>
        </div>
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
                borderColor: selected ? mc.diet : 'var(--border)',
                outline: isToday && !selected ? '1px solid var(--accent)' : 'none'
              }}
              title={`${d} ${recorded} 餐已记录 / ${planned} 餐已编排`}
            >
              <div className="text-[10px] font-bold">{formatCn(d)}</div>
              <div className="text-[9px] text-[var(--muted)]">{isToday ? '今天' : weekdayCn(d)}</div>
              <div className="text-[9px] mt-0.5" style={{ color: recorded ? mc.diet : 'var(--muted)' }}>
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
