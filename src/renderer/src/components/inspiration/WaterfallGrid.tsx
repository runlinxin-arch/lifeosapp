import { useEffect, useState } from 'react'
import type { Inspiration } from '@shared/types'
import { imageUrl } from '@shared/imageName'
import { useInspStore } from '../../stores/inspStore'
import { useModuleColors } from '../../hooks/useModuleColors'

/** 自适应列数：窄屏 2 列，中屏 3 列，宽屏 4 列 */
export function columnsForWidth(width: number): number {
  if (width < 640) return 2
  if (width < 1024) return 3
  return 4
}

export function InspirationCard(props: {
  item: Inspiration
  boardName: string | null
  onEdit: () => void
}): JSX.Element {
  const toggleStar = useInspStore((s) => s.toggleStar)
  const remove = useInspStore((s) => s.remove)
  const { item } = props
  const mc = useModuleColors()

  return (
    <div
      data-insp-card={item.id}
      className="group bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden mb-3"
    >
      {item.image_path && (
        <img
          src={imageUrl(item.image_path)}
          alt={item.text || '灵感图片'}
          className="w-full h-40 object-cover bg-[var(--bg)] cursor-pointer"
          onClick={props.onEdit}
        />
      )}

      <div className="px-2.5 py-2">
        <div className="flex items-start gap-1.5">
          {item.starred && <span className="text-[11px] shrink-0" title="精选">⭐</span>}
          <button
            onClick={props.onEdit}
            className="flex-1 text-left text-xs break-words whitespace-pre-wrap"
          >{item.text || (item.image_path ? '（图片）' : '（无内容）')}</button>
          <button
            onClick={() => void toggleStar(item.id, !item.starred)}
            className="text-[10px] text-[var(--muted)] hover:text-[var(--accent)] shrink-0"
            title={item.starred ? '取消精选' : '设为精选'}
          >{item.starred ? '☆' : '⭐'}</button>
          <button
            onClick={() => void remove(item.id)}
            className="text-[10px] text-[var(--muted)] hover:text-red-400 shrink-0"
            title="删除"
          >✕</button>
        </div>

        {item.source_url && (
          <div className="mt-1 text-[9px] text-[var(--muted)] truncate" title={item.source_url}>
            🔗 {item.source_url.replace(/^https?:\/\//, '')}
          </div>
        )}

        {(item.tags.length > 0 || props.boardName) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {props.boardName && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(232,121,201,0.15)', color: mc.inspiration }}>
                🗂 {props.boardName}
              </span>
            )}
            {item.tags.map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 瀑布流容器：按列数把卡片分到各列，用纯函数算分配（不依赖 DOM 测量） */
export function Waterfall(props: {
  columns: Inspiration[][]
  boardNameOf: (item: Inspiration) => string | null
  onEdit: (item: Inspiration) => void
}): JSX.Element {
  return (
    <div className="flex gap-3 items-start">
      {props.columns.map((col, i) => (
        <div key={i} className="flex-1 min-w-0">
          {col.map((item) => (
            <InspirationCard
              key={item.id}
              item={item}
              boardName={props.boardNameOf(item)}
              onEdit={() => props.onEdit(item)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 测量容器宽度决定列数（窗口尺寸变化时重算） */
export function useColumnCount(ref: React.RefObject<HTMLElement | null>): number {
  const [count, setCount] = useState(3)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => setCount(columnsForWidth(el.clientWidth))
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return count
}
