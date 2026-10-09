export type PageKey =
  | 'today' | 'schedule'
  | 'learning' | 'dev' | 'inspiration'
  | 'fitness' | 'diet' | 'entertainment'
  | 'settings'

const GROUPS: { label: string; items: { key: PageKey; icon: string; label: string; disabled?: boolean }[] }[] = [
  { label: '', items: [{ key: 'today', icon: '🏠', label: '今天' }] },
  { label: '', items: [{ key: 'schedule', icon: '📅', label: '日程' }] },
  {
    label: '工作',
    items: [
      { key: 'learning', icon: '📖', label: '自我学习' },
      { key: 'dev', icon: '💻', label: '开发' },
      { key: 'inspiration', icon: '✨', label: '设计灵感' }
    ]
  },
  {
    label: '生活',
    items: [
      { key: 'fitness', icon: '🏋️', label: '健身' },
      { key: 'diet', icon: '🍚', label: '饮食' },
      { key: 'entertainment', icon: '🎮', label: '游戏娱乐' }
    ]
  },
  { label: '', items: [{ key: 'settings', icon: '⚙️', label: '设置和数据', disabled: true }] }
]

export function Sidebar({ active, onNavigate }: { active: PageKey; onNavigate: (p: PageKey) => void }): JSX.Element {
  return (
    <nav className="h-full py-3 text-sm">
      {GROUPS.map((g, i) => (
        <div key={i} className="mb-3">
          {g.label && <div className="px-4 pb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">{g.label}</div>}
          {g.items.map((it) => (
            <button
              key={it.key}
              disabled={it.disabled}
              onClick={() => onNavigate(it.key)}
              className={`text-left px-4 py-2 rounded-md ${
                it.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : active === it.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text)] hover:bg-[var(--border)]'
              }`}
              style={{ width: 'calc(100% - 16px)', marginLeft: 8, marginRight: 8 }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
