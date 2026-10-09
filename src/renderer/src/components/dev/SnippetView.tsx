import { useMemo, useState } from 'react'
import type { Snippet, SnippetInput } from '@shared/types'
import { filterSnippets } from '@shared/snippetFilter'
import { useDevStore } from '../../stores/devStore'

const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
const EMPTY: SnippetInput = { title: '', code: '', language: '', tags: [] }

export function SnippetView(): JSX.Element {
  const snippets = useDevStore((s) => s.snippets)
  const filter = useDevStore((s) => s.snippetFilter)
  const setFilter = useDevStore((s) => s.setSnippetFilter)
  const createSnippet = useDevStore((s) => s.createSnippet)
  const updateSnippet = useDevStore((s) => s.updateSnippet)
  const removeSnippet = useDevStore((s) => s.removeSnippet)

  const [draft, setDraft] = useState<SnippetInput>(EMPTY)
  const [tagText, setTagText] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<SnippetInput>(EMPTY)

  /** 全部标签（去重、排序），供筛选条多选 */
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const s of snippets) for (const t of s.tags) set.add(t)
    return [...set].sort()
  }, [snippets])

  const visible = useMemo(() => filterSnippets(snippets, filter), [snippets, filter])

  const parseTagText = (t: string): string[] => t.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)

  const submit = async (): Promise<void> => {
    const title = draft.title.trim()
    if (!title) return
    if (await createSnippet({ ...draft, title, tags: parseTagText(tagText) })) {
      setDraft(EMPTY)
      setTagText('')
    }
  }

  const toggleTag = (t: string): void => {
    const cur = filter.tags ?? []
    setFilter({ ...filter, tags: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] })
  }

  const startEdit = (s: Snippet): void => {
    setEditingId(s.id)
    setEditDraft({ title: s.title, code: s.code, language: s.language, tags: s.tags })
    setTagText(s.tags.join(' '))
  }

  const saveEdit = async (): Promise<void> => {
    if (editingId === null) return
    const title = editDraft.title.trim()
    if (!title) return
    if (await updateSnippet(editingId, { ...editDraft, title, tags: parseTagText(tagText) })) {
      setEditingId(null)
      setTagText('')
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-bold mb-3">代码片段库</h2>

      {/* 新建 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="片段标题"
            className={`flex-1 ${inputCls} py-1.5`}
          />
          <input
            value={draft.language ?? ''}
            onChange={(e) => setDraft({ ...draft, language: e.target.value })}
            placeholder="语言"
            className={`${inputCls} w-24 py-1.5`}
          />
        </div>
        <textarea
          value={draft.code ?? ''}
          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          placeholder="代码内容"
          rows={4}
          className={`w-full ${inputCls} font-mono resize-y mb-2`}
        />
        <div className="flex items-center gap-2">
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="标签（空格或逗号分隔）"
            className={`flex-1 ${inputCls} py-1.5`}
          />
          <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">
            保存片段
          </button>
        </div>
      </div>

      {/* 筛选条 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={filter.keyword ?? ''}
            onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
            placeholder="搜索标题 / 代码 / 语言"
            className={`flex-1 ${inputCls} py-1.5`}
          />
          <span className="text-[10px] text-[var(--muted)]">{visible.length} / {snippets.length}</span>
          {(filter.keyword || (filter.tags ?? []).length > 0) && (
            <button onClick={() => setFilter({})} className="text-[10px] text-[var(--accent)]">清除筛选</button>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.map((t) => {
              const on = (filter.tags ?? []).includes(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className="text-[10px] px-1.5 py-0.5 rounded border"
                  style={{
                    borderColor: on ? 'var(--accent)' : 'var(--border)',
                    color: on ? 'var(--accent)' : 'var(--muted)',
                    background: on ? 'rgba(124,140,255,0.12)' : 'transparent'
                  }}
                >{t}</button>
              )
            })}
          </div>
        )}
      </div>

      {/* 列表 */}
      {visible.map((s) => (
        <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-2">
          {editingId === s.id ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  className={`flex-1 ${inputCls}`}
                />
                <input
                  value={editDraft.language ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, language: e.target.value })}
                  className={`${inputCls} w-24`}
                />
              </div>
              <textarea
                value={editDraft.code ?? ''}
                onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })}
                rows={5}
                className={`w-full ${inputCls} font-mono resize-y mb-2`}
              />
              <div className="flex items-center gap-2">
                <input
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  className={`flex-1 ${inputCls}`}
                />
                <button onClick={() => void saveEdit()} className="text-[10px] px-2 py-1 rounded bg-[var(--accent)] text-white">保存</button>
                <button onClick={() => { setEditingId(null); setTagText('') }} className="text-[10px] px-2 py-1 rounded bg-[var(--border)]">取消</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium flex-1 truncate">{s.title}</span>
                {s.language && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">{s.language}</span>
                )}
                <button
                  onClick={() => startEdit(s)}
                  className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
                >编辑</button>
                <button
                  onClick={() => void removeSnippet(s.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-red-400"
                >✕</button>
              </div>
              {s.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">{t}</span>
                  ))}
                </div>
              )}
              {s.code && (
                <pre className="mt-1.5 text-[10px] font-mono text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded p-2 overflow-hidden whitespace-pre-wrap break-words max-h-20">
                  {s.code}
                </pre>
              )}
            </>
          )}
        </div>
      ))}

      {visible.length === 0 && (
        <div className="text-center text-[var(--muted)] text-xs py-6">
          {snippets.length === 0 ? '还没有代码片段' : '没有匹配的片段'}
        </div>
      )}
    </div>
  )
}
