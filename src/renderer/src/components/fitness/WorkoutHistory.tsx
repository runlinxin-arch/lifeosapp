import type { WorkoutLog } from '@shared/types'
import { totalVolume } from '@shared/fitnessStats'
import { formatCn } from '@shared/dates'

/** 最近打卡历史（PRD 4.5「保留历史」）：按日期倒序展示，最多 6 条 */
export function WorkoutHistory({ logs, limit = 6 }: { logs: WorkoutLog[]; limit?: number }): JSX.Element {
  const rows = logs.slice(0, limit)

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-workout-history>
      <div className="text-sm font-bold mb-2">🗂 最近打卡</div>

      {rows.length === 0 ? (
        <div className="text-[10px] text-[var(--muted)] py-1">还没有历史记录</div>
      ) : (
        <div className="flex flex-col">
          {rows.map((l) => {
            const volume = totalVolume([l], l.date, l.date)
            return (
              <div
                key={l.id}
                data-history-row={l.date}
                className="flex items-center gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-b-0"
              >
                <span className="text-[var(--muted)] w-10 shrink-0">{formatCn(l.date)}</span>
                <span className="flex-1 truncate">
                  {l.content.length === 0 ? '只记了「练了」' : l.content.map((i) => i.name).join('、')}
                </span>
                <span className="text-[var(--muted)] shrink-0">{l.content.length} 个动作</span>
                <span className="shrink-0 w-20 text-right" style={{ color: '#e74c3c' }}>
                  {volume.toLocaleString()} kg
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
