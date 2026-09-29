import type { ReactNode } from 'react'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { todayStr, diffDays } from '../../lib/dates'

function ModuleCard({ icon, title, children }: { icon: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="text-sm font-bold mb-2">{icon} {title}</div>
      {children}
    </div>
  )
}

export function TodayCards(): JSX.Element {
  const { tasks } = useLongTasksStore()
  const today = todayStr()
  const active = tasks.filter((t) => t.start_date <= today && t.end_date >= today)

  return (
    <div>
      <ModuleCard icon="🗓️" title="长期任务">
        {active.length === 0 && <div className="text-xs text-[var(--muted)]">暂无进行中的长期任务</div>}
        {active.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-xs py-1">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
            <span className="flex-1">{t.title}</span>
            <span className="text-[var(--muted)]">剩 {Math.max(0, diffDays(t.end_date, today))} 天</span>
          </div>
        ))}
      </ModuleCard>

      <ModuleCard icon="🏋️" title="健身">
        <div className="text-xs text-[var(--muted)]">健身模块将在 M4 接入</div>
      </ModuleCard>
      <ModuleCard icon="🍚" title="饮食">
        <div className="text-xs text-[var(--muted)]">饮食模块将在 M4 接入</div>
      </ModuleCard>
      <ModuleCard icon="📖" title="自我学习">
        <div className="text-xs text-[var(--muted)]">学习模块将在 M3 接入</div>
      </ModuleCard>
      <ModuleCard icon="💻" title="开发">
        <div className="text-xs text-[var(--muted)]">开发模块将在 M3 接入</div>
      </ModuleCard>
    </div>
  )
}
