import { useEffect, useState } from 'react'
import type { Inspiration } from '@shared/types'
import { imageUrl } from '@shared/imageName'
import { useInspStore } from '../../stores/inspStore'

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]'

export function InspirationEditDialog(props: { item: Inspiration | null; onClose: () => void }): JSX.Element | null {
  const boards = useInspStore((s) => s.boards)
  const update = useInspStore((s) => s.update)
  const remove = useInspStore((s) => s.remove)
  const storeError = useInspStore((s) => s.error)
  const clearError = useInspStore((s) => s.clearError)

  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [tagText, setTagText] = useState('')
  const [boardId, setBoardId] = useState<number | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.item) return
    setText(props.item.text)
    setSourceUrl(props.item.source_url ?? '')
    setTagText(props.item.tags.join(' '))
    setBoardId(props.item.board_id)
    setLocalError(null)
    clearError()
  }, [props.item, clearError])

  if (!props.item) return null
  const item = props.item

  const save = async (): Promise<void> => {
    setLocalError(null)
    const url = sourceUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      setLocalError('链接必须以 http:// 或 https:// 开头')
      return
    }
    if (!text.trim() && !url && !item.image_path) {
      setLocalError('文字、链接、图片至少要保留一项')
      return
    }
    const ok = await update(item.id, {
      text: text.trim(),
      sourceUrl: url || null,
      boardId,
      tags: tagText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
    })
    if (ok) props.onClose()
  }

  const shownError = localError ?? storeError

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={props.onClose}>
      <div className="w-[520px] bg-[var(--card)] border border-[var(--border)] rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <span className="text-sm font-bold">编辑灵感</span>
          <button onClick={props.onClose} className="ml-auto text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>

        {item.image_path && (
          <img
            src={imageUrl(item.image_path)}
            alt="灵感图片"
            className="w-full max-h-48 object-contain bg-[var(--bg)] rounded mb-3"
          />
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="正文"
          rows={4}
          className={`${inputCls} resize-y mb-2`}
        />

        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="来源链接（可选）"
          className={`${inputCls} mb-2`}
        />

        <div className="flex items-center gap-2 mb-2">
          <select
            value={boardId === null ? '' : String(boardId)}
            onChange={(e) => setBoardId(e.target.value === '' ? null : Number(e.target.value))}
            className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none"
          >
            <option value="">不归属画板</option>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="标签"
            className={`flex-1 ${inputCls}`}
          />
        </div>

        {item.image_path && (
          <div className="mb-2 text-[9px] text-[var(--muted)]">
            图片文件：{item.image_path}（保存后若文字/链接都为空，图片会作为唯一内容保留）
          </div>
        )}

        {shownError && (
          <div className="mb-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            {shownError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={async () => { if (await remove(item.id)) props.onClose() }}
            className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-300 mr-auto"
          >删除（含图片文件）</button>
          <button onClick={props.onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button onClick={() => void save()} className="text-xs px-4 py-1.5 rounded text-white" style={{ background: '#e879c9' }}>保存</button>
        </div>
      </div>
    </div>
  )
}
