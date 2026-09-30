import { useMemo, useState } from 'react'
import type { Event, Occurrence } from '@shared/types'
import { layoutMonth } from '@shared/layout'
import { formatCn } from '@shared/dates'
import { useToday } from '../../hooks/useToday'

const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日']
const EVENT_COLOR = '#7c8cff'

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onPickDay: (date: string) => void
  onOpenEvent: (ev: Event) => void
}

export function MonthView({ occurrences, anchor, events, onPickDay, onOpenEvent }: Props): JSX.Element {
  const cells = useMemo(() => layoutMonth(occurrences, anchor), [occurrences, anchor])
  const today = useToday()
  const [expanded, setExpanded] = useState<string | null>(null)

  const openEvent = (eventId: number): void => {
    const ev = events.find((e) => e.id === eventId)
    if (ev) onOpenEvent(ev)
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 mb-1">
        {WEEK_LABEL.map((w) => (
          <div key={w} className="text-center text-xs text-[var(--muted)]">周{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-[var(--border)]">
        {cells.map((c) => (
          <div
            key={c.date}
            onClick={() => onPickDay(c.date)}
            className={`h-[92px] border-r border-b border-[var(--border)] p-1 overflow-hidden cursor-pointer hover:bg-[var(--border)]/30 ${
              c.inMonth ? '' : 'opacity-40'
            } ${c.date === today ? 'ring-1 ring-inset ring-[var(--accent)]' : ''}`}
          >
            <div className={`text-[10px] mb-0.5 ${c.date === today ? 'text-[var(--accent)] font-bold' : 'text-[var(--muted)]'}`}>
              {formatCn(c.date)}
            </div>
            {c.items.map((o) => (
              <div
                key={`${o.eventId}-${o.date}`}
                onClick={(e) => { e.stopPropagation(); openEvent(o.eventId) }}
                className="text-[9px] truncate rounded px-1 mb-0.5 text-white"
                style={{ background: EVENT_COLOR }}
                title={o.title}
              >{o.title}</div>
            ))}
            {c.extra > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(c.date) }}
                className="text-[9px] text-[var(--accent)]"
              >+{c.extra}</button>
            )}
          </div>
        ))}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setExpanded(null)}>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-72" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold mb-2">{expanded} 全部事件</div>
            {occurrences
              .filter((o) => o.date === expanded)
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((o) => (
                <div
                  key={`${o.eventId}-${o.date}`}
                  onClick={() => { setExpanded(null); openEvent(o.eventId) }}
                  className="text-xs py-1 cursor-pointer hover:text-[var(--accent)]"
                >
                  <span className="text-[var(--muted)] mr-1">{o.allDay ? '全天' : o.startAt.slice(11)}</span>{o.title}
                </div>
              ))}
            <button onClick={() => setExpanded(null)} className="mt-2 text-xs px-2 py-1 rounded bg-[var(--border)]">关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
