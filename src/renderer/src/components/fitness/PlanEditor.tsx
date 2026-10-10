import { useRef, useState } from 'react'
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

  // onBlur 若直接读 draft/nameDraft 会拿到上一次 render 的旧值（失焦时 React 未必已重渲染），
  // 导致"输入后立刻失焦"丢失最后一击。用 ref 存最新值，失焦保存永远不脏。
  const draftRef = useRef(draft)
  const nameRef = useRef(nameDraft)

  // 切换计划时同步草稿
  const [lastPlanId, setLastPlanId] = useState(plan.id)
  if (lastPlanId !== plan.id) {
    setLastPlanId(plan.id)
    setDraft(plan.schedule)
    setNameDraft(plan.name)
    draftRef.current = plan.schedule
    nameRef.current = plan.name
  }

  const save = async (next: Record<string, string>): Promise<void> => {
    setDraft(next)
    draftRef.current = next
    await updatePlan(plan.id, { schedule: next })
  }

  const setDay = (key: string, value: string): void => {
    const next = { ...draftRef.current }
    if (value.trim()) next[key] = value
    else delete next[key]
    draftRef.current = next
    setDraft(next)
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={nameDraft}
          onChange={(e) => { nameRef.current = e.target.value; setNameDraft(e.target.value) }}
          onBlur={() => { if (nameRef.current.trim() && nameRef.current !== plan.name) void updatePlan(plan.id, { name: nameRef.current }) }}
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
              onBlur={() => void save(draftRef.current)}
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
