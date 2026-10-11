import { useEffect, useState } from 'react'
import type { Event, EventInput, RepeatType } from '@shared/types'
import { datePart, timePart, todayStr } from '@shared/dates'
import { useSettingsStore } from '../../stores/settingsStore'

interface Props {
  open: boolean
  initial: Event | null
  defaultStart?: string
  onClose: () => void
  onSubmit: (input: EventInput) => Promise<boolean>
  onDelete?: (id: number) => Promise<boolean>
}

const REPEAT_LABEL: Record<RepeatType, string> = {
  none: '不重复', daily: '每天', weekly: '每周', monthly: '每月'
}

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'
const labelCls = 'text-xs text-[var(--muted)] mb-1'

/** 把 'YYYY-MM-DDTHH:MM' 加 1 小时，用于新建时的默认结束时间 */
function plusOneHour(local: string): string {
  const d = new Date(local)
  d.setHours(d.getHours() + 1)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventDialog({ open, initial, defaultStart, onClose, onSubmit, onDelete }: Props): JSX.Element | null {
  const defaultLead = useSettingsStore((s) => s.settings['remind.leadMinutes'])
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatUntil, setRepeatUntil] = useState('')
  const [remindMinutes, setRemindMinutes] = useState(defaultLead)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (initial) {
      setTitle(initial.title)
      setStart(`${datePart(initial.start_at)}T${timePart(initial.start_at)}`)
      setEnd(`${datePart(initial.end_at)}T${timePart(initial.end_at)}`)
      setAllDay(initial.all_day)
      setLocation(initial.location ?? '')
      setNote(initial.note ?? '')
      setRepeatType(initial.repeat_type)
      setRepeatInterval(initial.repeat_interval)
      setRepeatUntil(initial.repeat_until ?? '')
      setRemindMinutes(initial.remind_minutes)
    } else {
      const base = defaultStart ?? `${todayStr()}T09:00`
      setTitle('')
      setStart(base)
      setEnd(plusOneHour(base))
      setAllDay(false)
      setLocation('')
      setNote('')
      setRepeatType('none')
      setRepeatInterval(1)
      setRepeatUntil('')
      setRemindMinutes(defaultLead)
    }
  }, [open, initial, defaultStart, defaultLead])

  if (!open) return null

  const submit = async (): Promise<void> => {
    const startAt = allDay ? `${start.slice(0, 10)} 00:00` : start.replace('T', ' ')
    const endAt = allDay ? `${end.slice(0, 10)} 00:00` : end.replace('T', ' ')
    const ok = await onSubmit({
      title, startAt, endAt, allDay,
      location: location || null,
      note: note || null,
      repeatType, repeatInterval,
      repeatUntil: repeatUntil || null,
      remindMinutes
    })
    if (ok) onClose()
    else setError('保存失败，请检查标题与时间')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-[440px] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-sm mb-3">{initial ? '编辑事件' : '新建事件'}</div>

        <div className="mb-2">
          <div className={labelCls}>标题</div>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="事件标题" />
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--muted)] mb-2">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--accent)]" />
          全天事件
        </label>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <div className={labelCls}>开始</div>
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <div className={labelCls}>结束</div>
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(allDay ? `${e.target.value}T00:00` : e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="mb-2">
          <div className={labelCls}>地点</div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
        </div>

        <div className="mb-2">
          <div className={labelCls}>备注</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <div className={labelCls}>重复</div>
            <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as RepeatType)} className={inputCls}>
              {(Object.keys(REPEAT_LABEL) as RepeatType[]).map((k) => <option key={k} value={k}>{REPEAT_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="w-20">
            <div className={labelCls}>间隔</div>
            <input type="number" min={1} value={repeatInterval} disabled={repeatType === 'none'}
              onChange={(e) => setRepeatInterval(Number(e.target.value))} className={inputCls} />
          </div>
          <div className="w-28">
            <div className={labelCls}>提前提醒</div>
            <input type="number" min={0} max={1440} value={remindMinutes}
              onChange={(e) => setRemindMinutes(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        {repeatType !== 'none' && (
          <div className="mb-2">
            <div className={labelCls}>重复截止（可空）</div>
            <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputCls} />
          </div>
        )}

        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

        <div className="flex gap-2 justify-end mt-3">
          {initial && onDelete && (
            <button
              onClick={() => { void onDelete(initial.id).then((ok) => { if (ok) onClose() }) }}
              className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-300 mr-auto"
            >删除</button>
          )}
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">保存</button>
        </div>
      </div>
    </div>
  )
}
