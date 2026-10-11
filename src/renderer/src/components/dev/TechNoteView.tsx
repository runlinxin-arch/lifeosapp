import { useState } from 'react'
import type { TechNote, TechNoteInput } from '@shared/types'
import { useDevStore } from '../../stores/devStore'
import { useModuleColors } from '../../hooks/useModuleColors'

const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
const EMPTY: TechNoteInput = { title: '', content: '', projectId: null }

export function TechNoteView(): JSX.Element {
  const notes = useDevStore((s) => s.notes)
  const projects = useDevStore((s) => s.projects)
  const createNote = useDevStore((s) => s.createNote)
  const updateNote = useDevStore((s) => s.updateNote)
  const removeNote = useDevStore((s) => s.removeNote)
  const mc = useModuleColors()

  const [draft, setDraft] = useState<TechNoteInput>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<TechNoteInput>(EMPTY)

  const projectName = (id: number | null): string =>
    id === null ? '未关联' : (projects.find((p) => p.id === id)?.name ?? `项目 ${id} 已删除`)

  const submit = async (): Promise<void> => {
    const title = draft.title.trim()
    if (!title) return
    if (await createNote({ ...draft, title })) setDraft(EMPTY)
  }

  const startEdit = (n: TechNote): void => {
    setEditingId(n.id)
    setEditDraft({ title: n.title, content: n.content, projectId: n.project_id })
  }

  const saveEdit = async (): Promise<void> => {
    if (editingId === null) return
    const title = editDraft.title.trim()
    if (!title) return
    if (await updateNote(editingId, { ...editDraft, title })) setEditingId(null)
  }

  const projectSelect = (
    value: number | null,
    onChange: (v: number | null) => void
  ): JSX.Element => (
    <select
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={inputCls}
    >
      <option value="">不关联项目</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-bold mb-3">技术笔记</h2>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="笔记标题"
            className={`flex-1 ${inputCls} py-1.5`}
          />
          {projectSelect(draft.projectId ?? null, (v) => setDraft({ ...draft, projectId: v }))}
        </div>
        <textarea
          value={draft.content ?? ''}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="正文"
          rows={4}
          className={`w-full ${inputCls} resize-y mb-2`}
        />
        <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">
          保存笔记
        </button>
      </div>

      {notes.map((n) => (
        <div key={n.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-2">
          {editingId === n.id ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  className={`flex-1 ${inputCls}`}
                />
                {projectSelect(editDraft.projectId ?? null, (v) => setEditDraft({ ...editDraft, projectId: v }))}
              </div>
              <textarea
                value={editDraft.content ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })}
                rows={5}
                className={`w-full ${inputCls} resize-y mb-2`}
              />
              <div className="flex gap-2">
                <button onClick={() => void saveEdit()} className="text-[10px] px-2 py-1 rounded bg-[var(--accent)] text-white">保存</button>
                <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded bg-[var(--border)]">取消</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium flex-1 truncate">{n.title}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{
                    background: n.project_id === null ? 'var(--border)' : 'rgba(52,152,219,0.15)',
                    color: n.project_id === null ? 'var(--muted)' : mc.dev
                  }}
                >{projectName(n.project_id)}</span>
                <button
                  onClick={() => startEdit(n)}
                  className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
                >编辑</button>
                <button
                  onClick={() => void removeNote(n.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-red-400"
                >✕</button>
              </div>
              {n.content && (
                <div className="mt-1 text-[10px] text-[var(--muted)] whitespace-pre-wrap break-words">{n.content}</div>
              )}
            </>
          )}
        </div>
      ))}

      {notes.length === 0 && (
        <div className="text-center text-[var(--muted)] text-xs py-6">还没有技术笔记</div>
      )}
    </div>
  )
}
