import { useMemo } from 'react'
import type { WorkoutLog } from '@shared/types'
import { totalVolume, workoutCount, workoutStreak } from '@shared/fitnessStats'
import { weekDays } from '@shared/layout'
import { formatCn } from '@shared/dates'
import { useToday } from '../../hooks/useToday'

const DAY_LABEL = ['一', '二', '三', '四', '五', '六', '日']

/** 本周统计：训练次数 / 总容量 / 连续打卡 */
export function WeeklyStats({ logs }: { logs: WorkoutLog[] }): JSX.Element {
  const today = useToday()
  const days = weekDays(today)

  const stats = useMemo(() => ({
    count: workoutCount(logs, days[0], days[6]),
    volume: totalVolume(logs, days[0], days[6]),
    streak: workoutStreak(logs, today)
  }), [logs, days, today])

  const trainedDays = useMemo(() => new Set(logs.map((l) => l.date)), [logs])

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
      <div className="text-sm font-bold mb-2">📊 本周统计</div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[10px] text-[var(--muted)]">训练次数</div>
          <div className="text-lg font-bold" style={{ color: '#e74c3c' }} data-stat-count={stats.count}>
            {stats.count}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted)]">总容量</div>
          <div className="text-lg font-bold" data-stat-volume={stats.volume}>
            {stats.volume.toLocaleString()}
            <span className="text-[10px] text-[var(--muted)] ml-0.5">kg</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted)]">连续打卡</div>
          <div className="text-lg font-bold" data-stat-streak={stats.streak}>
            {stats.streak > 0 ? `🔥 ${stats.streak}` : '—'}
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        {days.map((d, i) => {
          const trained = trainedDays.has(d)
          const isToday = d === today
          return (
            <div key={d} className="flex-1 text-center">
              <div className="text-[9px] text-[var(--muted)] mb-0.5">周{DAY_LABEL[i]}</div>
              <div
                className="h-6 rounded flex items-center justify-center text-[9px]"
                style={{
                  background: trained ? '#e74c3c' : 'var(--border)',
                  color: trained ? '#fff' : 'var(--muted)',
                  outline: isToday ? '1px solid var(--accent)' : 'none'
                }}
                title={`${formatCn(d)}${trained ? ' · 已训练' : ''}`}
              >{trained ? '✓' : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
