import { useState } from 'react'
import type { LearnStatus, LearnType } from '@shared/types'
import { progressPercent } from '@shared/learnStats'
import { useLearnStore } from '../../stores/learnStore'
import { LearnTimer } from './LearnTimer'

const TYPE_LABEL: Record<LearnType, string> = { book: '📖 书', course: '🎬 课程', skill: '🧠 技能' }
const STATUS_LABEL: Record<LearnStatus, string> = {
  not_started: '未开始', learning: '学习中', done: '已完成'
}
const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'

export function LearnDetail({ itemId }: { itemId: number }): JSX.Element | null {
  const { items, notes, updateItem, removeItem, setProgress, createNote, updateNote, removeNote, select } = useLearnStore()
  const item = items.find((i) => i.id === itemId)
  const [noteText, setNoteText] = useState('')
  const [editingNote, setEditingNote] = useState<{ id: number; text: string } | null>(null)

  if (!item) return <div className="text-xs text-[var(--muted)]">学习项不存在</div>

  const pct = progressPercent(item)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold flex-1 truncate">{item.title}</h2>
        <button
          onClick={() => { void removeItem(item.id) }}
          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300"
        >删除</button>
        <button
          onClick={() => select(null)}
          className="text-xs px-2 py-1 rounded bg-[var(--border)]"
        >返回统计</button>
      </div>

      {/* 基本属性 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
        <div className="text-xs text-[var(--muted)] mb-2">基本属性</div>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <label className="flex items-center gap-1">
            类型
            <select
              value={item.type}
              onChange={(e) => { void updateItem(item.id, { type: e.target.value as LearnType }) }}
              className={inputCls}
            >
              {(Object.keys(TYPE_LABEL) as LearnType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            状态
            <select
              value={item.status}
              onChange={(e) => { void updateItem(item.id, { status: e.target.value as LearnStatus }) }}
              className={inputCls}
            >
              {(Object.keys(STATUS_LABEL) as LearnStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-[var(--muted)]">
          <span>起止日期（供长期任务联动）</span>
          <input
            type="date"
            value={item.start_date ?? ''}
            onChange={(e) => { void updateItem(item.id, { startDate: e.target.value || null }) }}
            className={inputCls}
          />
          <span>→</span>
          <input
            type="date"
            value={item.end_date ?? ''}
            onChange={(e) => { void updateItem(item.id, { endDate: e.target.value || null }) }}
            className={inputCls}
          />
        </div>
      </div>

      {/* 计时 */}
      <LearnTimer itemId={item.id} />

      {/* 进度 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
        <div className="text-xs text-[var(--muted)] mb-2">进度</div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number" min={0}
            value={item.total_units}
            onChange={(e) => { void updateItem(item.id, { totalUnits: Number(e.target.value) }) }}
            className={`${inputCls} w-20`}
          />
          <span className="text-xs text-[var(--muted)]">总量</span>
          <input
            type="number" min={0}
            value={item.done_units}
            onChange={(e) => { void setProgress(item.id, Number(e.target.value)) }}
            className={`${inputCls} w-20`}
          />
          <span className="text-xs text-[var(--muted)]">已完成</span>
          <span className="ml-auto text-sm font-bold" style={{ color: '#4ade80' }}>{pct}%</span>
        </div>
        <div className="h-2 rounded bg-[var(--border)] overflow-hidden">
          <div className="h-full" style={{ width: `${pct}%`, background: '#4ade80' }} />
        </div>
      </div>

      {/* 笔记 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="text-xs text-[var(--muted)] mb-2">学习笔记（{notes.length}）</div>
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && noteText.trim()) {
              void createNote(item.id, noteText.trim()).then((ok) => { if (ok) setNoteText('') })
            }
          }}
          placeholder="记一条笔记，回车保存"
          className={`w-full mb-2 ${inputCls}`}
        />

        {notes.map((n) => (
          <div key={n.id} className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
            {editingNote?.id === n.id ? (
              <>
                <input
                  autoFocus
                  value={editingNote.text}
                  onChange={(e) => setEditingNote({ id: n.id, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void updateNote(n.id, editingNote.text).then((ok) => { if (ok) setEditingNote(null) })
                    }
                  }}
                  className={`flex-1 ${inputCls}`}
                />
                <button
                  onClick={() => { void updateNote(n.id, editingNote.text).then((ok) => { if (ok) setEditingNote(null) }) }}
                  className="text-xs text-[var(--accent)]"
                >保存</button>
                <button onClick={() => setEditingNote(null)} className="text-xs text-[var(--muted)]">取消</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm whitespace-pre-wrap break-words">{n.content}</span>
                <button
                  onClick={() => setEditingNote({ id: n.id, text: n.content })}
                  className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                >改</button>
                <button
                  onClick={() => { void removeNote(n.id) }}
                  className="text-xs text-[var(--muted)] hover:text-red-400"
                >✕</button>
              </>
            )}
          </div>
        ))}
        {notes.length === 0 && <div className="text-xs text-[var(--muted)] py-2">还没有笔记</div>}
      </div>
    </div>
  )
}
