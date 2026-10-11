import { useMemo } from 'react'
import { dailyMinutes, streakDays, sumMinutes, weekMinutes } from '@shared/learnStats'
import { formatDuration } from '@shared/duration'
import { weekDays } from '@shared/layout'
import { formatCn } from '@shared/dates'
import { useLearnStore } from '../../stores/learnStore'
import { useToday } from '../../hooks/useToday'
import { useModuleColors } from '../../hooks/useModuleColors'

const BAR_AREA_H = 64
const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日']

export function LearnStatsPanel(): JSX.Element {
  const sessions = useLearnStore((s) => s.sessions)
  const today = useToday()
  const mc = useModuleColors()

  const days = useMemo(() => weekDays(today), [today])
  const perDay = useMemo(() => dailyMinutes(sessions, days), [sessions, days])
  const todayMinutes = useMemo(() => sumMinutes(sessions, today, today), [sessions, today])
  const week = useMemo(() => weekMinutes(sessions, today), [sessions, today])
  const streak = useMemo(() => streakDays(sessions, today), [sessions, today])
  const peak = Math.max(1, ...perDay.map((d) => d.minutes))

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">今日学习</div>
          <div className="text-lg font-bold" style={{ color: mc.learning }}>{formatDuration(todayMinutes)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">本周学习</div>
          <div className="text-lg font-bold">{formatDuration(week)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-[10px] text-[var(--muted)] mb-1">连续学习</div>
          <div className="text-lg font-bold">{streak > 0 ? `🔥 ${streak} 天` : '—'}</div>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="text-[10px] text-[var(--muted)] mb-2">本周每日时长</div>
        <div className="flex items-end gap-2" style={{ height: BAR_AREA_H }}>
          {perDay.map((d, i) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[9px] text-[var(--muted)] mb-1">{d.minutes > 0 ? d.minutes : ''}</div>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(d.minutes > 0 ? 3 : 0, (d.minutes / peak) * (BAR_AREA_H - 18))}px`,
                  background: d.date === today ? 'var(--accent)' : '#4ade80'
                }}
                title={`${d.date} · ${d.minutes} 分钟`}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          {days.map((d, i) => (
            <div key={d} className={`flex-1 text-center text-[9px] ${d === today ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
              周{WEEK_LABEL[i]}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-0.5">
          {days.map((d) => (
            <div key={d} className="flex-1 text-center text-[9px] text-[var(--muted)]">{formatCn(d)}</div>
          ))}
        </div>
      </div>

      <div className="mt-3 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--muted)]">
        从左侧选择一个学习项即可查看进度、笔记与计时。
      </div>
    </div>
  )
}
