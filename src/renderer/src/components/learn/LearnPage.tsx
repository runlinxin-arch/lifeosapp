import { useEffect, useState } from 'react'
import type { LearnStatus, LearnType } from '@shared/types'
import { progressPercent } from '@shared/learnStats'
import { useLearnStore } from '../../stores/learnStore'
import { LearnStatsPanel } from './LearnStatsPanel'
import { LearnDetail } from './LearnDetail'

const TYPE_ICON: Record<LearnType, string> = { book: '📖', course: '🎬', skill: '🧠' }
const STATUS_LABEL: Record<LearnStatus, string> = {
  not_started: '未开始', learning: '学习中', done: '已完成'
}

export function LearnPage(): JSX.Element {
  const { items, selectedId, error, clearError, load, select, createItem } = useLearnStore()
  const [title, setTitle] = useState('')

  useEffect(() => { void load() }, [load])

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) return
    if (await createItem({ title: t })) setTitle('')
  }

  return (
    <div className="h-full flex">
      <section className="w-[42%] p-4 border-r border-[var(--border)] overflow-auto">
        <h2 className="text-base font-bold mb-3">学习清单</h2>

        {error && (
          <div className="flex items-center gap-2 mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
          </div>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="添加学习项，回车确认"
          className="w-full mb-3 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />

        {items.map((it) => {
          const pct = progressPercent(it)
          const active = it.id === selectedId
          return (
            <button
              key={it.id}
              onClick={() => select(active ? null : it.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border mb-2 ${
                active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--card)]'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{TYPE_ICON[it.type]}</span>
                <span className="flex-1 truncate">{it.title}</span>
                <span className="text-[10px] text-[var(--muted)]">{STATUS_LABEL[it.status]}</span>
              </div>
              <div className="mt-2 h-1.5 rounded bg-[var(--border)] overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: '#4ade80' }} />
              </div>
              <div className="mt-1 flex items-center text-[10px] text-[var(--muted)]">
                <span>{it.total_units > 0 ? `${it.done_units}/${it.total_units} · ${pct}%` : '未设目标'}</span>
                {it.start_date && it.end_date && (
                  <span className="ml-auto">{it.start_date.slice(5)} → {it.end_date.slice(5)}</span>
                )}
              </div>
            </button>
          )
        })}

        {items.length === 0 && (
          <div className="text-center text-[var(--muted)] text-sm py-8">还没有学习项，加一个吧</div>
        )}
      </section>

      <section className="flex-1 p-4 overflow-auto">
        {selectedId === null
          ? <LearnStatsPanel />
          : <LearnDetail itemId={selectedId} />}
      </section>
    </div>
  )
}
