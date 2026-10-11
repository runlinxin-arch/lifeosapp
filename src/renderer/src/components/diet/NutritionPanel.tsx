import type { Meal } from '@shared/types'
import { MEAL_LABELS, MEAL_TYPES } from '@shared/dietContent'
import { dayNutrition, nutritionByMeal } from '@shared/dietStats'
import { useModuleColors } from '../../hooks/useModuleColors'

const fmt = (n: number): string => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1))

/** 每日摄入面板：热量 + 三大营养素合计，纯数值展示（PRD L109；不做目标值与进度条） */
export function NutritionPanel({ date, meals }: { date: string; meals: Meal[] }): JSX.Element {
  const mc = useModuleColors()
  const total = dayNutrition(meals, date)
  const byMeal = nutritionByMeal(meals, date)
  const empty = total.calories === 0 && total.protein === 0 && total.carbs === 0 && total.fat === 0

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-nutrition-panel>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">🍽 今日摄入</span>
        <span className="ml-auto text-[9px] text-[var(--muted)]">{date}</span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold leading-none" style={{ color: mc.diet }} data-nutrition-calories={total.calories}>
          {fmt(total.calories)}
        </span>
        <span className="text-[10px] text-[var(--muted)] mb-0.5">kcal</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[10px] text-[var(--muted)]">蛋白质</div>
          <div className="text-sm font-bold" data-nutrition-protein={total.protein}>{fmt(total.protein)}<span className="text-[9px] text-[var(--muted)] ml-0.5">g</span></div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted)]">碳水</div>
          <div className="text-sm font-bold" data-nutrition-carbs={total.carbs}>{fmt(total.carbs)}<span className="text-[9px] text-[var(--muted)] ml-0.5">g</span></div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted)]">脂肪</div>
          <div className="text-sm font-bold" data-nutrition-fat={total.fat}>{fmt(total.fat)}<span className="text-[9px] text-[var(--muted)] ml-0.5">g</span></div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-2">
        <div className="text-[10px] text-[var(--muted)] mb-1">按餐次</div>
        {MEAL_TYPES.map((t) => (
          <div key={t} className="flex items-center gap-2 text-[11px] py-0.5" data-nutrition-meal={t}>
            <span className="w-8 text-[var(--muted)]">{MEAL_LABELS[t]}</span>
            <span className="flex-1 text-right">{fmt(byMeal[t].calories)} kcal</span>
            <span className="text-[var(--muted)] w-28 text-right">
              蛋{fmt(byMeal[t].protein)} 碳{fmt(byMeal[t].carbs)} 脂{fmt(byMeal[t].fat)}
            </span>
          </div>
        ))}
      </div>

      {empty && <div className="text-[10px] text-[var(--muted)] mt-2">这一天还没有记录</div>}
    </div>
  )
}
