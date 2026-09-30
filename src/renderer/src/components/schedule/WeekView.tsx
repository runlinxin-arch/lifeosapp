import { useMemo, useState } from 'react'
import type { Event, Occurrence } from '@shared/types'
import { layoutWeek, hourFromOffsetY } from '@shared/layout'
import { formatCn, pad2 } from '@shared/dates'
import { useToday } from '../../hooks/useToday'

const HOUR_HEIGHT = 44
const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日']
const EVENT_COLOR = '#7c8cff'

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onCreateAt: (start?: string) => void
  onEdit: (ev: Event) => void
  /** 今天页待办被拖入格子时回调（跨页面拖拽不保证生效，「转日程」按钮是等价路径） */
  onDropTask?: (payload: { taskId: number; title: string; startAt: string; endAt: string }) => void
}

export function WeekView({ occurrences, anchor, events, onCreateAt, onEdit, onDropTask }: Props): JSX.Element {
  const { days, allDay, blocks } = useMemo(() => layoutWeek(occurrences, anchor), [occurrences, anchor])
  const today = useToday()
  const [dropDay, setDropDay] = useState<string | null>(null)

  const openEvent = (eventId: number): void => {
    const ev = events.find((e) => e.id === eventId)
    if (ev) onEdit(ev)
  }

  // 拖入格子：把待办落到该格对应的时间点
  const onDrop = (date: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDropDay(null)
    let payload: { id: number; title: string } | null = null
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/lifeos-task'))
    } catch {
      payload = null
    }
    if (!payload?.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = hourFromOffsetY(e.clientY - rect.top, HOUR_HEIGHT)
    onDropTask?.({
      taskId: payload.id,
      title: payload.title,
      startAt: `${date} ${pad2(hour)}:00`,
      endAt: `${date} ${pad2(hour)}:59`
    })
  }

  return (
    <div className="p-4">
      {/* 全天通栏 */}
      <div className="flex mb-2">
        <div className="w-12 shrink-0" />
        {days.map((d) => (
          <div key={d} className="flex-1 min-w-0 border-l border-[var(--border)] px-1">
            {allDay.filter((o) => o.date === d).map((o) => (
              <div
                key={o.eventId}
                onClick={() => openEvent(o.eventId)}
                className="text-[10px] truncate rounded px-1 py-0.5 mb-0.5 cursor-pointer text-white"
                style={{ background: EVENT_COLOR }}
                title={o.title}
              >{o.title}</div>
            ))}
          </div>
        ))}
      </div>

      {/* 日期表头 */}
      <div className="flex border-b border-[var(--border)] pb-1">
        <div className="w-12 shrink-0" />
        {days.map((d, i) => (
          <div key={d} className={`flex-1 text-center text-xs ${d === today ? 'text-[var(--accent)] font-bold' : 'text-[var(--muted)]'}`}>
            周{WEEK_LABEL[i]} {formatCn(d)}
          </div>
        ))}
      </div>

      {/* 时间网格 */}
      <div className="flex relative" style={{ height: HOUR_HEIGHT * 24 }}>
        <div className="w-12 shrink-0 relative">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="absolute right-1 text-[9px] text-[var(--muted)] -translate-y-1/2"
              style={{ top: h * HOUR_HEIGHT }}
            >{h === 0 ? '' : `${pad2(h)}:00`}</div>
          ))}
        </div>

        {days.map((d, dayIndex) => (
          <div
            key={d}
            onDragOver={(e) => { e.preventDefault(); setDropDay(d) }}
            onDragLeave={() => setDropDay((cur) => (cur === d ? null : cur))}
            onDrop={onDrop(d)}
            onDoubleClick={() => onCreateAt(`${d}T09:00`)}
            className={`flex-1 min-w-0 relative border-l border-[var(--border)] ${
              d === today ? 'bg-[var(--accent)]/5 ring-1 ring-inset ring-[var(--accent)]' : ''
            } ${dropDay === d ? 'bg-[var(--accent)]/10' : ''}`}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-[var(--border)]/40" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {blocks.filter((b) => b.dayIndex === dayIndex).map((b) => {
              const widthPct = 100 / b.laneCount
              return (
                <div
                  key={`${b.occurrence.eventId}-${b.occurrence.date}`}
                  onClick={() => openEvent(b.occurrence.eventId)}
                  className="absolute rounded px-1 text-[10px] text-white overflow-hidden cursor-pointer hover:brightness-110"
                  style={{
                    top: `${b.topPct}%`,
                    height: `${b.heightPct}%`,
                    left: `${b.lane * widthPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                    background: EVENT_COLOR
                  }}
                  title={`${b.occurrence.title} ${b.occurrence.startAt.slice(11)}-${b.occurrence.endAt.slice(11)}`}
                >
                  {b.occurrence.title}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
