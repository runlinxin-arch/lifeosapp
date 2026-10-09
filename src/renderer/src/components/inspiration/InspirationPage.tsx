import { useEffect, useMemo, useRef, useState } from 'react'
import type { Inspiration } from '@shared/types'
import { distributeColumns, estimateCardHeight } from '@shared/waterfall'
import { useInspStore } from '../../stores/inspStore'
import { Waterfall, useColumnCount } from './WaterfallGrid'
import { CaptureDialog } from './CaptureDialog'
import { InspirationEditDialog } from './InspirationEditDialog'
import { BoardView } from './BoardView'

export function InspirationPage(): JSX.Element {
  const {
    view, setView, items, boards, tags, filter, selectedBoardId,
    error, clearError, load, setFilter, openBoard
  } = useInspStore()

  const [captureOpen, setCaptureOpen] = useState(false)
  const [editing, setEditing] = useState<Inspiration | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const columnCount = useColumnCount(containerRef)

  useEffect(() => { void load() }, [load])

  const columns = useMemo(
    () => distributeColumns(items, columnCount, estimateCardHeight),
    [items, columnCount]
  )

  const boardNameOf = (item: Inspiration): string | null =>
    item.board_id === null ? null : (boards.find((b) => b.id === item.board_id)?.name ?? null)

  const selectedBoard = selectedBoardId === null ? null : boards.find((b) => b.id === selectedBoardId) ?? null
  const activeTags = filter.tags ?? []
  const starredOnly = filter.starred === true

  const toggleTag = (t: string): void => {
    void setFilter({ ...filter, tags: activeTags.includes(t) ? activeTags.filter((x) => x !== t) : [...activeTags, t] })
  }

  return (
    <div
      className="h-full flex flex-col"
      data-insp-filter={JSON.stringify(filter)}
      data-insp-items={items.length}
      data-insp-tags={tags.length}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0 flex-wrap">
        <h2 className="text-base font-bold">
          {selectedBoard ? `🗂 ${selectedBoard.name}` : '设计灵感'}
        </h2>

        {selectedBoard && (
          <button onClick={() => void openBoard(null)} className="text-[10px] px-2 py-1 rounded bg-[var(--border)]">
            ← 全部灵感
          </button>
        )}

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => setView('flow')}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              view === 'flow' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]'
            }`}
          >瀑布流</button>
          <button
            onClick={() => setView('boards')}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              view === 'boards' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]'
            }`}
          >画板</button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[var(--muted)]">{items.length} 条</span>
          <button
            onClick={() => setCaptureOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg text-white"
            style={{ background: '#e879c9' }}
          >＋ 捕获</button>
        </div>
      </div>

      {view === 'flow' && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void setFilter({ ...filter, starred: starredOnly ? undefined : true })}
              className="text-[10px] px-2 py-1 rounded border"
              style={{
                borderColor: starredOnly ? 'var(--accent)' : 'var(--border)',
                color: starredOnly ? 'var(--accent)' : 'var(--muted)'
              }}
            >⭐ 精选</button>

            <input
              value={filter.keyword ?? ''}
              onChange={(e) => void setFilter({ ...filter, keyword: e.target.value })}
              placeholder="搜索文字 / 链接 / 标签"
              className="w-56 bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
            />

            {tags.map((t) => {
              const on = activeTags.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className="text-[10px] px-1.5 py-0.5 rounded border"
                  style={{
                    borderColor: on ? '#e879c9' : 'var(--border)',
                    color: on ? '#e879c9' : 'var(--muted)',
                    background: on ? 'rgba(232,121,201,0.12)' : 'transparent'
                  }}
                >{t}</button>
              )
            })}

            {(filter.keyword || activeTags.length > 0 || starredOnly || typeof filter.boardId === 'number') && (
              <button
                onClick={() => void setFilter({ boardId: selectedBoardId ?? 'all' })}
                className="text-[10px] text-[var(--accent)]"
              >清除筛选</button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 px-4 pb-4 overflow-auto">
        {view === 'boards'
          ? <BoardView onOpenBoard={(id) => { setView('flow'); void openBoard(id) }} />
          : items.length === 0
            ? (
              <div className="text-center text-[var(--muted)] text-sm py-12">
                {selectedBoard ? '这个画板还没有灵感' : '还没有灵感，点右上角「＋ 捕获」开始收集'}
              </div>
            )
            : <Waterfall columns={columns} boardNameOf={boardNameOf} onEdit={setEditing} />}
      </div>

      <CaptureDialog
        open={captureOpen}
        boardId={selectedBoardId}
        onClose={() => setCaptureOpen(false)}
      />
      <InspirationEditDialog item={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
