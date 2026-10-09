import { useState } from 'react'
import type { Priority, WishItem } from '@shared/types'
import { sortWishlist } from '@shared/entStats'
import { PRIORITY_LABELS } from '@shared/entContent'
import { useEntertainmentStore } from '../../stores/entertainmentStore'

const PURPLE = '#a06ee1'
const PRIORITIES: Priority[] = ['high', 'mid', 'low']
const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

const PRIORITY_COLOR: Record<Priority, string> = { high: '#e74c3c', mid: '#f39c12', low: '#8b8d98' }

/** 愿望单：名称 + 平台 + 优先级；列表按优先级排序（高在前） */
export function Wishlist({ items }: { items: WishItem[] }): JSX.Element {
  const addWish = useEntertainmentStore((s) => s.addWish)
  const updateWish = useEntertainmentStore((s) => s.updateWish)
  const removeWish = useEntertainmentStore((s) => s.removeWish)

  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')

  const submit = async (): Promise<void> => {
    if (!name.trim()) return
    if (await addWish({ name: name.trim(), platform, priority })) {
      setName('')
      setPlatform('')
      setPriority('mid')
    }
  }

  const rows = sortWishlist(items)

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="text-sm font-bold mb-2">🛒 添加想入手的游戏</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            data-wish-name
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="游戏名称"
            className={`${inputCls} w-44`}
          />
          <input
            data-wish-platform
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="平台（可留空）"
            className={`${inputCls} w-36`}
          />
          <select
            data-wish-priority
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputCls}
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>优先级 {PRIORITY_LABELS[p]}</option>)}
          </select>
          <button
            data-action="add-wish"
            onClick={() => void submit()}
            className="text-xs px-3 py-1 rounded text-white"
            style={{ background: PURPLE }}
          >添加</button>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-wishlist>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold">📋 愿望单</span>
          <span className="ml-auto text-[10px] text-[var(--muted)]" data-wish-count={rows.length}>
            {rows.length} 个
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="text-[10px] text-[var(--muted)] py-1">愿望单还是空的</div>
        ) : (
          <div className="flex flex-col">
            {rows.map((w) => (
              <div
                key={w.id}
                data-wish-row={w.name}
                data-priority={w.priority}
                className="flex items-center gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-b-0"
              >
                <span
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: `${PRIORITY_COLOR[w.priority]}22`, color: PRIORITY_COLOR[w.priority] }}
                >{PRIORITY_LABELS[w.priority]}</span>
                <span className="flex-1 truncate">{w.name}</span>
                <span className="text-[var(--muted)] w-24 truncate shrink-0">{w.platform || '—'}</span>
                <select
                  data-wish-prio={w.id}
                  value={w.priority}
                  onChange={(e) => void updateWish(w.id, { priority: e.target.value as Priority })}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-0.5 text-[10px] outline-none shrink-0"
                  title="调整优先级"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
                <button
                  data-action={`del-wish-${w.id}`}
                  onClick={() => void removeWish(w.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1 shrink-0"
                  title="删除"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
