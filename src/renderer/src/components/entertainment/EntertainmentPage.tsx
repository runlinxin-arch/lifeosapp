import { useEffect } from 'react'
import { useEntertainmentStore, type EntTab } from '../../stores/entertainmentStore'
import { PlayLog } from './PlayLog'
import { Wishlist } from './Wishlist'
import { MediaList } from './MediaList'

const PURPLE = '#a06ee1'

const TABS: { key: EntTab; label: string }[] = [
  { key: 'plays', label: '游玩记录' },
  { key: 'wishlist', label: '愿望单' },
  { key: 'screen', label: '影视' },
  { key: 'book', label: '书籍' }
]

const HINTS: Record<EntTab, string> = {
  plays: '可切本周 / 本月 / 全部，点聚合行可按游戏筛选',
  wishlist: '高优先级排在最前',
  screen: '电影与剧集，按状态分组，可打星与写短评',
  book: '书籍与影视分开记录'
}

export function EntertainmentPage(): JSX.Element {
  const { plays, wishlist, media, tab, error, clearError, load, setTab } = useEntertainmentStore()

  useEffect(() => { void load() }, [load])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0 flex-wrap">
        <h2 className="text-base font-bold">游戏娱乐</h2>

        <div className="flex items-center gap-1 ml-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              data-tab={t.key}
              data-tab-active={tab === t.key ? 'true' : 'false'}
              onClick={() => setTab(t.key)}
              className="text-xs px-3 py-1 rounded border transition-colors"
              style={{
                background: tab === t.key ? 'rgba(160,110,225,0.18)' : 'var(--card)',
                borderColor: tab === t.key ? PURPLE : 'var(--border)',
                color: tab === t.key ? PURPLE : 'var(--text)'
              }}
            >{t.label}</button>
          ))}
        </div>

        <span className="text-[10px] text-[var(--muted)] ml-auto">{HINTS[tab]}</span>
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 overflow-auto">
        {tab === 'plays' && <PlayLog plays={plays} />}
        {tab === 'wishlist' && <Wishlist items={wishlist} />}
        {tab === 'screen' && <MediaList items={media} scope="screen" />}
        {tab === 'book' && <MediaList items={media} scope="book" />}
      </div>
    </div>
  )
}
