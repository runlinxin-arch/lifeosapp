import { useState } from 'react'
import { imageUrl } from '@shared/imageName'
import { useInspStore } from '../../stores/inspStore'

export function BoardView(props: { onOpenBoard: (id: number) => void }): JSX.Element {
  const boards = useInspStore((s) => s.boards)
  const stats = useInspStore((s) => s.boardStats)
  const createBoard = useInspStore((s) => s.createBoard)
  const removeBoard = useInspStore((s) => s.removeBoard)

  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const updateBoard = useInspStore((s) => s.updateBoard)

  const submit = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    if (await createBoard({ name: n })) setName('')
  }

  return (
    <div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3 max-w-md">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="新建画板名称，回车确认"
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
          />
          <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: '#e879c9' }}>
            新建画板
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {boards.map((b) => {
          const st = stats.get(b.id) ?? { count: 0, coverImage: null }
          return (
            <div key={b.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
              <div
                className="h-32 bg-[var(--bg)] cursor-pointer flex items-center justify-center"
                onClick={() => props.onOpenBoard(b.id)}
              >
                {st.coverImage
                  ? <img src={imageUrl(st.coverImage)} alt={b.name} className="w-full h-full object-cover" />
                  : <span className="text-2xl opacity-30">🗂</span>}
              </div>

              <div className="px-2.5 py-2">
                {renaming?.id === b.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: b.id, name: e.target.value })}
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (await updateBoard(b.id, { name: renaming.name })) setRenaming(null)
                      }}
                      className="text-[10px] text-[var(--accent)]"
                    >存</button>
                    <button onClick={() => setRenaming(null)} className="text-[10px] text-[var(--muted)]">取消</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => props.onOpenBoard(b.id)}
                      className="flex-1 text-left text-xs truncate"
                    >{b.name}</button>
                    <span className="text-[10px] text-[var(--muted)] shrink-0">{st.count} 条</span>
                    <button
                      onClick={() => setRenaming({ id: b.id, name: b.name })}
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
                    >改</button>
                    <button
                      onClick={() => void removeBoard(b.id)}
                      title="删除画板（灵感条目会保留，只解除归属）"
                      className="text-[10px] text-[var(--muted)] hover:text-red-400"
                    >✕</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {boards.length === 0 && (
        <div className="text-center text-[var(--muted)] text-xs py-8">还没有画板</div>
      )}
    </div>
  )
}
