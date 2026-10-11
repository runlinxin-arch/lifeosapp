import { useRef, useState } from 'react'
import type { MealPlan, MealType } from '@shared/types'
import { MEAL_LABELS, MEAL_TYPES } from '@shared/dietContent'
import { planText } from '@shared/dietStats'
import { useDietStore } from '../../stores/dietStore'
import { useModuleColors } from '../../hooks/useModuleColors'

const inputCls = 'flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 某天四个餐次的计划文本编辑：失焦或回车即保存；清空并保存 = 删除该计划 */
export function MealPlanEditor({ date, plans }: { date: string; plans: MealPlan[] }): JSX.Element {
  const savePlan = useDietStore((s) => s.savePlan)
  const removePlan = useDietStore((s) => s.removePlan)
  const [draft, setDraft] = useState<Record<string, string>>({})
  // onBlur 若直接读 draft 会拿到上一次 render 的旧值（失焦时 React 未必已重渲染），
  // 导致"输入后立刻失焦"丢失最后一击。用 ref 存最新值。
  const draftRef = useRef<Record<string, string>>({})
  const mc = useModuleColors()

  const setDraftValue = (type: MealType, value: string): void => {
    const next = { ...draftRef.current, [type]: value }
    draftRef.current = next
    setDraft(next)
  }

  const valueOf = (type: MealType): string => draftRef.current[type] ?? planText(plans, date, type)

  const commit = async (type: MealType): Promise<void> => {
    const next = valueOf(type).trim()
    const existing = plans.find((p) => p.date === date && p.type === type) ?? null

    if (!next) {
      if (existing) await removePlan(existing.id)
    } else if (existing?.content !== next) {
      await savePlan({ date, type, content: next })
    }
    const rest = { ...draftRef.current }
    delete rest[type]
    draftRef.current = rest
    setDraft(rest)
  }

  const plannedCount = MEAL_TYPES.filter((t) => planText(plans, date, t)).length

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-plan-editor>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">📝 饮食计划</span>
        <span className="text-[9px] text-[var(--muted)]">{date}</span>
        <span className="ml-auto text-[9px] text-[var(--muted)]" data-plan-count={plannedCount}>
          已编排 {plannedCount}/4
        </span>
      </div>

      {MEAL_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-[var(--muted)] w-8 shrink-0">{MEAL_LABELS[type]}</span>
          <input
            data-plan-input={type}
            value={valueOf(type)}
            placeholder="留空表示不计划"
            onChange={(e) => setDraftValue(type, e.target.value)}
            onBlur={() => void commit(type)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className={inputCls}
          />
          {planText(plans, date, type) && (
            <button
              data-plan-clear={type}
              onClick={() => void removePlan(plans.find((p) => p.date === date && p.type === type)!.id)}
              className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1 shrink-0"
              title="清除这一餐的计划"
            >✕</button>
          )}
        </div>
      ))}

      <div className="text-[9px] text-[var(--muted)] mt-1" style={{ color: 'var(--muted)' }}>
        填写后自动保存 · <span style={{ color: mc.diet }}>为未来日期编排</span>：先在上方横条选日期
      </div>
    </div>
  )
}
