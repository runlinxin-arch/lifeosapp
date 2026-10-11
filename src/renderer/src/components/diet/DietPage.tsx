import { useEffect } from 'react'
import { MEAL_TYPES } from '@shared/dietContent'
import { mealByType, planText } from '@shared/dietStats'
import { addDays, formatCn, weekdayCn } from '@shared/dates'
import { useDietStore } from '../../stores/dietStore'
import { MealCard } from './MealCard'
import { NutritionPanel } from './NutritionPanel'
import { MealPlanStrip } from './MealPlanStrip'
import { MealPlanEditor } from './MealPlanEditor'
import { useModuleColors } from '../../hooks/useModuleColors'

export function DietPage(): JSX.Element {
  const { meals, plans, date, today, error, clearError, load, setDate } = useDietStore()
  const mc = useModuleColors()

  useEffect(() => { void load() }, [load])

  const isToday = date === today

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0 flex-wrap">
        <h2 className="text-base font-bold">饮食</h2>

        <div className="flex items-center gap-1.5 ml-2">
          <button
            data-action="prev-day"
            onClick={() => setDate(addDays(date, -1))}
            className="text-xs w-6 h-6 rounded bg-[var(--card)] border border-[var(--border)]"
          >‹</button>
          <span data-diet-date={date} className="text-xs px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)]">
            {formatCn(date)} {weekdayCn(date)}
          </span>
          <button
            data-action="next-day"
            onClick={() => setDate(addDays(date, 1))}
            className="text-xs w-6 h-6 rounded bg-[var(--card)] border border-[var(--border)]"
          >›</button>
          {!isToday && (
            <button
              data-action="back-today"
              onClick={() => setDate(today)}
              className="text-[10px] px-2 py-1 rounded text-white"
              style={{ background: mc.diet }}
            >回到今天</button>
          )}
        </div>

        <span className="text-[10px] text-[var(--muted)] ml-auto">
          {isToday ? '今天' : '为这一天编排与记录'}
        </span>
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 overflow-auto">
        <MealPlanStrip today={today} date={date} meals={meals} plans={plans} onSelect={setDate} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-3">
            {MEAL_TYPES.map((type) => (
              <MealCard
                key={`${date}-${type}`}
                date={date}
                type={type}
                meal={mealByType(meals, date, type)}
                planned={planText(plans, date, type)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <NutritionPanel date={date} meals={meals} />
            <MealPlanEditor key={date} date={date} plans={plans} />
          </div>
        </div>
      </div>
    </div>
  )
}
