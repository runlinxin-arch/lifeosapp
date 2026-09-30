import { useEffect, useState } from 'react'
import { todayStr } from '@shared/dates'

export interface ConvertTarget {
  id: number
  title: string
  date: string
}

interface Props {
  task: ConvertTarget | null
  onClose: () => void
  onSubmit: (startAt: string, endAt: string) => Promise<void>
}

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'

export function ConvertDialog({ task, onClose, onSubmit }: Props): JSX.Element | null {
  const [date, setDate] = useState(todayStr())
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!task) return
    setError('')
    setBusy(false)
    setDate(task.date || todayStr())
    setStart('09:00')
    setEnd('10:00')
  }, [task])

  if (!task) return null

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      await onSubmit(`${date} ${start}`, `${date} ${end}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold mb-1">转为日程</div>
        <div className="text-xs text-[var(--muted)] mb-3">「{task.title}」将由日程接管，原待办行会被移除</div>
        <div className="mb-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2 mb-3">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </div>
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white disabled:opacity-50"
          >确认转换</button>
        </div>
      </div>
    </div>
  )
}
