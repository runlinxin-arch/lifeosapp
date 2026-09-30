import { useEffect, useState } from 'react'
import type { Event } from '@shared/types'
import { useEventsStore } from '../../stores/eventsStore'
import { EventDialog } from './EventDialog'
import { WeekView } from './WeekView'
import { MonthView } from './MonthView'
import { addDays, addMonthsClamped, formatCn } from '@shared/dates'
import { weekStart } from '@shared/layout'
import { useToday } from '../../hooks/useToday'

export function SchedulePage(): JSX.Element {
  const {
    view, anchor, events, occurrences, error, clearError,
    setView, setAnchor, reload, create, update, remove
  } = useEventsStore()
  const today = useToday()
  const [editing, setEditing] = useState<Event | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStart, setDefaultStart] = useState<string | undefined>(undefined)

  useEffect(() => { void reload() }, [reload, today])

  const step = (dir: -1 | 1): void => {
    if (view === 'week') setAnchor(addDays(weekStart(anchor), dir * 7))
    else setAnchor(addMonthsClamped(`${anchor.slice(0, 7)}-01`, dir))
  }

  const openCreate = (start?: string): void => {
    setEditing(null)
    setDefaultStart(start)
    setDialogOpen(true)
  }

  const openEdit = (ev: Event): void => {
    setEditing(ev)
    setDefaultStart(undefined)
    setDialogOpen(true)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex rounded overflow-hidden border border-[var(--border)]">
          <button onClick={() => setView('week')}
            className={`text-xs px-3 py-1 ${view === 'week' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}>周</button>
          <button onClick={() => setView('month')}
            className={`text-xs px-3 py-1 ${view === 'month' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}>月</button>
        </div>
        <button onClick={() => step(-1)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">‹</button>
        <button onClick={() => setAnchor(today)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">今天</button>
        <button onClick={() => step(1)} className="text-xs px-2 py-1 rounded bg-[var(--border)]">›</button>
        <span className="text-sm font-bold ml-2">
          {view === 'week' ? `${formatCn(weekStart(anchor))} 那周` : anchor.slice(0, 7)}
        </span>
        <button onClick={() => openCreate()} className="ml-auto text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">＋新建事件</button>
      </header>

      {error && (
        <div className="flex items-center gap-2 mx-4 mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {view === 'week'
          ? <WeekView occurrences={occurrences} anchor={anchor} events={events} onCreateAt={openCreate} onEdit={openEdit} />
          : <MonthView occurrences={occurrences} anchor={anchor} events={events}
              onPickDay={(d) => { setAnchor(d); setView('week') }} onOpenEvent={openEdit} />}
      </div>

      <EventDialog
        open={dialogOpen}
        initial={editing}
        defaultStart={defaultStart}
        onClose={() => setDialogOpen(false)}
        onSubmit={(input) => (editing ? update(editing.id, input) : create(input))}
        onDelete={remove}
      />
    </div>
  )
}
