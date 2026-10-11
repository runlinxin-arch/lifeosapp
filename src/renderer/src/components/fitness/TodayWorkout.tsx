import { useState } from 'react'
import type { WorkoutItem, WorkoutLog, WorkoutPlan } from '@shared/types'
import { planForDate, totalVolume } from '@shared/fitnessStats'
import { useFitnessStore } from '../../stores/fitnessStore'
import { useToday } from '../../hooks/useToday'
import { WorkoutItemEditor } from './WorkoutItemEditor'

/** 今日训练：按计划的当天安排预填动作，完成后打卡 */
export function TodayWorkout({ plan }: { plan: WorkoutPlan | null }): JSX.Element {
  const logs = useFitnessStore((s) => s.logs)
  const saveLog = useFitnessStore((s) => s.saveLog)
  const updateLog = useFitnessStore((s) => s.updateLog)
  const removeLog = useFitnessStore((s) => s.removeLog)
  const today = useToday()

  const planned = plan ? planForDate(plan.schedule, today) : null
  const existing: WorkoutLog | undefined = logs.find((l) => l.date === today)

  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<WorkoutItem[]>([])

  const startEdit = (): void => {
    setItems(existing ? existing.content.map((i) => ({ ...i })) : [])
    setEditing(true)
  }

  /** 同一天再次打卡是**更新**而非新增，避免一天出现多条记录 */
  const submit = async (): Promise<void> => {
    const payload = { planId: plan?.id ?? null, content: items }
    const ok = existing
      ? await updateLog(existing.id, payload)
      : await saveLog({ date: today, ...payload })
    if (ok) setEditing(false)
  }

  const volume = existing ? totalVolume([existing], today, today) : 0

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">🏋️ 今日训练</span>
        {planned && (
          <span data-workout-planned={planned} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(231,76,60,0.15)', color: '#e74c3c' }}>
            {planned}
          </span>
        )}
      </div>

      {!plan && <div className="text-xs text-[var(--muted)]">还没有训练计划，先建一个并编排一周安排</div>}

      {plan && !planned && !existing && (
        <div className="text-xs text-[var(--muted)]">今天没有安排，也可以直接记一笔</div>
      )}

      {existing && !editing && (
        <div data-workout-logged="true" className="mb-2">
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>已打卡</span>
            <span className="text-[var(--muted)]">{existing.content.length} 个动作 · 总容量 {volume.toLocaleString()} kg</span>
          </div>
          {existing.content.map((it, i) => (
            <div key={i} className="text-[11px] text-[var(--muted)] py-0.5">
              {it.name} · {it.weight}kg × {it.sets} 组 × {it.reps} 次
              <span className="ml-1 text-[9px]">（{it.weight * it.sets * it.reps} kg）</span>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <button onClick={startEdit} className="text-[10px] px-2 py-1 rounded bg-[var(--border)]">编辑</button>
            <button
              onClick={() => void removeLog(existing.id)}
              className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-300"
            >取消打卡</button>
          </div>
        </div>
      )}

      {!existing && !editing && plan && (
        <button
          data-action="start-workout"
          onClick={startEdit}
          className="text-xs px-3 py-1.5 rounded text-white"
          style={{ background: '#e74c3c' }}
        >开始今天的训练</button>
      )}

      {editing && (
        <div>
          <WorkoutItemEditor items={items} onChange={setItems} />
          <div className="flex gap-2 mt-2">
            <button
              data-action="submit-workout"
              onClick={() => void submit()}
              className="text-xs px-3 py-1.5 rounded text-white"
              style={{ background: '#e74c3c' }}
            >完成打卡</button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
            <span className="text-[9px] text-[var(--muted)] self-center">动作可留空，只记"练了"</span>
          </div>
        </div>
      )}
    </div>
  )
}
