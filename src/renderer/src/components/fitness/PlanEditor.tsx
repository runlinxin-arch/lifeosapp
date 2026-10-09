import { useState } from 'react'
import type { WorkoutPlan } from '@shared/types'
import { WEEKDAY_LABELS } from '@shared/fitnessContent'
import { useFitnessStore } from '../../stores/fitnessStore'

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 一周七格编排：每格失焦或回车即保存整周安排 */
export function PlanEditor({ plan }: { plan: WorkoutPlan }): JSX.Element {
  const updatePlan = useFitnessStore((s) => s.updatePlan)
  const removePlan = useFitnessStore((s) => s.removePlan)
  const [draft, setDraft] = useState<Record<string, string>>(plan.schedule)
  const [nameDraft, setNameDraft] = useState(plan.name)

  // 切换计划时同步草稿
  const [lastPlanId, setLastPlanId] = useState(plan.id)
  if (lastPlanId !== plan.id) {
    setLastPlanId(plan.id)
    setDraft(plan.schedule)
    setNameDraft(plan.name)
  }

  const save = async (next: Record<string, string>): Promise<void> => {
    setDraft(next)
    await updatePlan(plan.id, { schedule: next })
  }

  const setDay = (key: string, value: string): void => {
    const next = { ...draft }
    if (value.trim()) next[key] = value
    else delete next[key]
    setDraft(next)
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => { if (nameDraft.trim() && nameDraft !== plan.name) void updatePlan(plan.id, { name: nameDraft }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="flex-1 bg-transparent text-sm font-bold outline-none"
        />
        <button
          onClick={() => void removePlan(plan.id)}
          className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300"
        >删除计划</button>
      </div>

      <div className="text-[10px] text-[var(--muted)] mb-2">一周安排（填写后自动保存；留空表示当天不练）</div>

      <div className="grid grid-cols-7 gap-1.5">
        {Object.keys(WEEKDAY_LABELS).map((key) => (
          <div key={key}>
            <div className="text-[10px] text-[var(--muted)] text-center mb-0.5">{WEEKDAY_LABELS[key]}</div>
            <input
              data-plan-day={key}
              value={draft[key] ?? ''}
              onChange={(e) => setDay(key, e.target.value)}
              onBlur={() => void save(draft)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="—"
              className={`${inputCls} text-center`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
