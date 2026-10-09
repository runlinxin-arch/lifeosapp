import { useState } from 'react'
import type { Meal, MealItem, MealType } from '@shared/types'
import { MEAL_LABELS } from '@shared/dietContent'
import { sumNutrition } from '@shared/dietStats'
import { useDietStore } from '../../stores/dietStore'
import { MealItemEditor } from './MealItemEditor'

const AMBER = '#f39c12'

/** 单餐卡片：已记录显示食物+热量，未记录显示虚线占位（PRD L109） */
export function MealCard({ date, type, meal, planned }: {
  date: string
  type: MealType
  meal: Meal | null
  planned: string
}): JSX.Element {
  const saveMeal = useDietStore((s) => s.saveMeal)
  const removeMeal = useDietStore((s) => s.removeMeal)

  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<MealItem[]>([])

  const startEdit = (): void => {
    setItems(meal ? meal.items.map((i) => ({ ...i })) : [])
    setEditing(true)
  }

  const submit = async (): Promise<void> => {
    if (await saveMeal({ date, type, items })) setEditing(false)
  }

  const total = meal ? sumNutrition(meal.items) : null

  return (
    <div data-meal-card={type} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">{MEAL_LABELS[type]}</span>
        {total && (
          <span className="text-[11px]" style={{ color: AMBER }} data-meal-calories={total.calories}>
            {total.calories.toLocaleString()} kcal
          </span>
        )}
        {!meal && !editing && (
          <button
            data-action={`log-${type}`}
            onClick={startEdit}
            className="ml-auto text-[10px] px-2 py-1 rounded text-white"
            style={{ background: AMBER }}
          >记录这一餐</button>
        )}
      </div>

      {planned && (
        <div className="text-[10px] text-[var(--muted)] mb-2">计划：{planned}</div>
      )}

      {!meal && !editing && (
        <div
          data-meal-empty={type}
          className="border border-dashed border-[var(--border)] rounded-lg py-4 text-center text-[10px] text-[var(--muted)]"
        >未记录</div>
      )}

      {meal && !editing && (
        <div data-meal-logged={type}>
          {meal.items.length === 0 ? (
            <div className="text-[11px] text-[var(--muted)] py-1">只记了「这顿吃了」</div>
          ) : (
            <div className="flex flex-col">
              {meal.items.map((it, i) => (
                <div
                  key={i}
                  data-food-row={i}
                  className="flex items-center gap-2 text-[11px] py-0.5 border-b border-[var(--border)] last:border-b-0"
                >
                  <span className="flex-1 truncate">{it.name}</span>
                  <span className="text-[var(--muted)] shrink-0">{it.calories} kcal</span>
                  <span className="text-[var(--muted)] shrink-0 w-24 text-right">
                    蛋{it.protein} 碳{it.carbs} 脂{it.fat}
                  </span>
                </div>
              ))}
            </div>
          )}
          {total && (
            <div className="text-[10px] text-[var(--muted)] mt-1">
              合计 热量 {total.calories} · 蛋白 {total.protein}g · 碳水 {total.carbs}g · 脂肪 {total.fat}g
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              data-action={`edit-${type}`}
              onClick={startEdit}
              className="text-[10px] px-2 py-1 rounded bg-[var(--border)]"
            >编辑</button>
            <button
              data-action={`clear-${type}`}
              onClick={() => void removeMeal(meal.id)}
              className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300"
            >取消打卡</button>
          </div>
        </div>
      )}

      {editing && (
        <div>
          <MealItemEditor items={items} onChange={setItems} />
          <div className="flex items-center gap-2 mt-2">
            <button
              data-action={`save-${type}`}
              onClick={() => void submit()}
              className="text-xs px-3 py-1.5 rounded text-white"
              style={{ background: AMBER }}
            >保存</button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
            <span className="text-[9px] text-[var(--muted)]">食物可留空，只记「这顿吃了」</span>
          </div>
        </div>
      )}
    </div>
  )
}
