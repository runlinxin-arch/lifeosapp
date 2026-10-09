import { useState } from 'react'
import type { Play } from '@shared/types'
import { gameSummaries, recentPlays, totalMinutes } from '@shared/entStats'
import { formatDuration } from '@shared/duration'
import { todayStr } from '@shared/dates'
import { useEntertainmentStore } from '../../stores/entertainmentStore'

const PURPLE = '#a06ee1'
const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 游玩记录：录入一次游玩 + 按游戏聚合的总时长 + 明细 */
export function PlayLog({ plays }: { plays: Play[] }): JSX.Element {
  const addPlay = useEntertainmentStore((s) => s.addPlay)
  const removePlay = useEntertainmentStore((s) => s.removePlay)

  const [game, setGame] = useState('')
  const [date, setDate] = useState(() => todayStr())
  const [minutes, setMinutes] = useState('')

  const submit = async (): Promise<void> => {
    const m = Math.round(Number(minutes))
    if (!game.trim() || !Number.isFinite(m) || m <= 0) return
    if (await addPlay({ game: game.trim(), date, minutes: m })) {
      setGame('')
      setMinutes('')
    }
  }

  const summaries = gameSummaries(plays)
  const rows = recentPlays(plays, 20)

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
        <div className="text-sm font-bold mb-2">🎮 记录一次游玩</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            data-play-game
            value={game}
            onChange={(e) => setGame(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="游戏名称"
            className={`${inputCls} w-44`}
          />
          <input
            data-play-date
            type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
          <input
            data-play-minutes
            type="number" min={1} max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="时长（分钟）"
            className={`${inputCls} w-28`}
          />
          <button
            data-action="add-play"
            onClick={() => void submit()}
            className="text-xs px-3 py-1 rounded text-white"
            style={{ background: PURPLE }}
          >记录</button>
          <span className="text-[9px] text-[var(--muted)]">1–1440 分钟</span>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-game-summaries>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold">📊 按游戏聚合</span>
          <span className="ml-auto text-[10px] text-[var(--muted)]" data-total-minutes={totalMinutes(plays)}>
            共 {formatDuration(totalMinutes(plays))} · {summaries.length} 个游戏
          </span>
        </div>

        {summaries.length === 0 ? (
          <div className="text-[10px] text-[var(--muted)] py-1">还没有游玩记录</div>
        ) : (
          <div className="flex flex-col">
            {summaries.map((s) => (
              <div
                key={s.game}
                data-game-summary={s.game}
                data-total-minutes={s.totalMinutes}
                data-sessions={s.sessions}
                className="flex items-center gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-b-0"
              >
                <span className="flex-1 truncate">{s.game}</span>
                <span className="text-[var(--muted)] shrink-0">{s.sessions} 次</span>
                <span className="text-[var(--muted)] shrink-0 w-24 text-right">最近 {s.lastDate}</span>
                <span className="shrink-0 w-16 text-right font-bold" style={{ color: PURPLE }}>
                  {formatDuration(s.totalMinutes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3" data-play-detail>
        <div className="text-sm font-bold mb-2">🗂 明细（最近 20 条）</div>
        {rows.length === 0 ? (
          <div className="text-[10px] text-[var(--muted)] py-1">还没有记录</div>
        ) : (
          <div className="flex flex-col">
            {rows.map((p) => (
              <div
                key={p.id}
                data-play-row={p.id}
                className="flex items-center gap-2 text-[11px] py-1 border-b border-[var(--border)] last:border-b-0"
              >
                <span className="text-[var(--muted)] w-16 shrink-0">{p.date}</span>
                <span className="flex-1 truncate">{p.game}</span>
                <span className="shrink-0 w-16 text-right">{formatDuration(p.minutes)}</span>
                <button
                  data-action={`del-play-${p.id}`}
                  onClick={() => void removePlay(p.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1 shrink-0"
                  title="删除这条记录"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
