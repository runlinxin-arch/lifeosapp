import { useEffect, useState } from 'react'
import type { Media, MediaStatus, MediaType } from '@shared/types'
import { mediaGroups, mediaInScope, type MediaScope } from '@shared/entStats'
import {
  MEDIA_STATUSES, MEDIA_STATUS_LABELS, MEDIA_TYPES, MEDIA_TYPE_LABELS
} from '@shared/entContent'
import { shouldFollowToday } from '@shared/formDate'
import { useToday } from '../../hooks/useToday'
import { useEntertainmentStore } from '../../stores/entertainmentStore'
import { StarRating } from './StarRating'

const PURPLE = '#a06ee1'
const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 该栏允许的类型：影视 = 电影/剧集，书籍 = 书籍 */
const typesFor = (scope: MediaScope): MediaType[] => (scope === 'book' ? ['book'] : ['movie', 'series'])

/** 影视 / 书籍：类型 / 状态 / 五星评分 / 短评，按状态分组展示 */
export function MediaList({ items, scope }: { items: Media[]; scope: MediaScope }): JSX.Element {
  const addMedia = useEntertainmentStore((s) => s.addMedia)
  const updateMedia = useEntertainmentStore((s) => s.updateMedia)
  const removeMedia = useEntertainmentStore((s) => s.removeMedia)

  const allowed = typesFor(scope)
  const today = useToday()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<MediaType>(allowed[0])
  const [status, setStatus] = useState<MediaStatus>('planned')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [date, setDate] = useState(today)
  const [dateTouched, setDateTouched] = useState(false)

  // 跨零点时默认日期跟随「今天」；用户手动选过日期就不再覆盖
  useEffect(() => {
    if (shouldFollowToday({ touched: dateTouched, current: date, today })) setDate(today)
  }, [dateTouched, date, today])

  const scoped = mediaInScope(items, scope)
  const groups = mediaGroups(scoped)
  const scopeLabel = scope === 'book' ? '书籍' : '影视'

  const submit = async (): Promise<void> => {
    if (!title.trim()) return
    const ok = await addMedia({ title: title.trim(), type, status, rating, comment, date })
    if (ok) {
      setTitle('')
      setComment('')
      setRating(0)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-media-scope={scope}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="text-sm font-bold mb-2">
          {scope === 'book' ? '📚 添加书籍' : '🎬 添加影视'}
          <span className="ml-2 text-[10px] text-[var(--muted)]">
            {scope === 'book' ? '与影视分开记录' : '电影 / 剧集'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <input
            data-media-title
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="标题"
            className={`${inputCls} w-44`}
          />
          <select data-media-type value={type} onChange={(e) => setType(e.target.value as MediaType)} className={inputCls}>
            {MEDIA_TYPES.filter((t) => allowed.includes(t)).map((t) => (
              <option key={t} value={t}>{MEDIA_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select data-media-status value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)} className={inputCls}>
            {MEDIA_STATUSES.map((s) => <option key={s} value={s}>{MEDIA_STATUS_LABELS[s]}</option>)}
          </select>
          <StarRating value={rating} onChange={setRating} testId="new" />
          <input
            data-media-date
            type="date" value={date}
            onChange={(e) => { setDateTouched(true); setDate(e.target.value) }}
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            data-media-comment
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="短评（可留空）"
            className={`${inputCls} flex-1`}
          />
          <button
            data-action="add-media"
            onClick={() => void submit()}
            className="text-xs px-3 py-1 rounded text-white shrink-0"
            style={{ background: PURPLE }}
          >添加</button>
        </div>
      </div>

      <div className="text-[10px] text-[var(--muted)] px-1" data-media-total={scoped.length}>
        {scopeLabel}共 {scoped.length} 条
      </div>

      {MEDIA_STATUSES.map((s) => (
        <div key={s} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-media-group={s}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold">{MEDIA_STATUS_LABELS[s]}</span>
            <span className="ml-auto text-[10px] text-[var(--muted)]" data-media-count={groups[s].length}>
              {groups[s].length} 条
            </span>
          </div>

          {groups[s].length === 0 ? (
            <div className="text-[10px] text-[var(--muted)] py-1">暂无</div>
          ) : (
            <div className="flex flex-col">
              {groups[s].map((m) => (
                <div
                  key={m.id}
                  data-media-row={m.id}
                  data-media-rating={m.rating}
                  data-media-type-row={m.type}
                  className="flex items-center gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-b-0"
                >
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)]">
                    {MEDIA_TYPE_LABELS[m.type]}
                  </span>
                  <span className="shrink-0 max-w-[26%] truncate">{m.title}</span>
                  <StarRating
                    value={m.rating}
                    onChange={(v) => void updateMedia(m.id, { rating: v })}
                    testId={`row-${m.id}`}
                  />
                  <span className="flex-1 truncate text-[var(--muted)]">{m.comment || '—'}</span>
                  <span className="text-[var(--muted)] shrink-0">{m.date}</span>
                  <button
                    data-action={`del-media-${m.id}`}
                    onClick={() => void removeMedia(m.id)}
                    className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1 shrink-0"
                    title="删除"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
