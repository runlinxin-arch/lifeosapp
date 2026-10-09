import { useEffect, useState } from 'react'
import { useFitnessStore } from '../../stores/fitnessStore'
import { PlanEditor } from './PlanEditor'
import { TodayWorkout } from './TodayWorkout'
import { BodyTrend } from './BodyTrend'
import { WeeklyStats } from './WeeklyStats'
import { WorkoutHistory } from './WorkoutHistory'

export function FitnessPage(): JSX.Element {
  const { plans, logs, selectedPlanId, error, clearError, load, selectPlan, createPlan } = useFitnessStore()
  const [newName, setNewName] = useState('')

  useEffect(() => { void load() }, [load])

  const plan = plans.find((p) => p.id === selectedPlanId) ?? null

  const submit = async (): Promise<void> => {
    const n = newName.trim()
    if (!n) return
    if (await createPlan({ name: n })) setNewName('')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0 flex-wrap">
        <h2 className="text-base font-bold">健身</h2>

        {plans.length > 0 && (
          <select
            value={selectedPlanId ?? ''}
            onChange={(e) => selectPlan(e.target.value ? Number(e.target.value) : null)}
            className="text-xs bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 outline-none"
          >
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        <div className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="新建计划名称"
            className="w-40 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => void submit()}
            className="text-xs px-3 py-1 rounded text-white"
            style={{ background: '#e74c3c' }}
          >新建计划</button>
        </div>

        {plan && <span className="text-[10px] text-[var(--muted)] ml-auto">近 400 天已练 {logs.length} 次</span>}
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 overflow-auto">
        {!plan && plans.length === 0 && (
          <div className="text-center text-[var(--muted)] text-sm py-12">
            还没有训练计划——新建一个，然后编排一周练什么
          </div>
        )}

        {plan && (
          <>
            <PlanEditor plan={plan} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-3">
                <TodayWorkout plan={plan} />
                <WorkoutHistory logs={logs} />
              </div>
              <div className="flex flex-col gap-3">
                <BodyTrend />
                <WeeklyStats logs={logs} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
