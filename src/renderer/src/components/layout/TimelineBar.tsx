import { useEffect, useMemo, useState } from 'react'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToday } from '../../hooks/useToday'
import { calcBlocks, timelineBarHeight, timelineGridHeight, timelineHeight, TIMELINE_BOTTOM_PAD, TIMELINE_GRID_MAX_H, TIMELINE_ROW_GAP, TIMELINE_TOP_PAD } from '../../lib/timeline'
import { addDays, diffDays, formatCn } from '../../lib/dates'
import type { LongTask } from '@shared/types'

const SOURCE_LABEL: Record<string, string> = {
  schedule: '日程', learning: '自我学习', dev: '开发', inspiration: '设计灵感',
  fitness: '健身', diet: '饮食'
}

export function TimelineBar(): JSX.Element {
  const { tasks, range, error, clearError, reload, create, remove, setDone } = useLongTasksStore()
  const { settings, load: loadSettings, set: setSetting } = useSettingsStore()
  const today = useToday()
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<LongTask | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', start: today, end: addDays(today, 13) })

  useEffect(() => { void loadSettings() }, [loadSettings])
  // today 变化（跨零点）或显示范围变化时重新拉取
  useEffect(() => { void reload() }, [reload, today, settings['timeline.rangeDays']])

  // 「显示已完成」只影响呈现，不影响数据
  const visible = useMemo(
    () => (settings['timeline.showDone'] ? tasks : tasks.filter((t) => !t.done)),
    [tasks, settings]
  )

  const blocks = useMemo(() => calcBlocks(visible, range.from, range.to), [visible, range])
  const laneCount = Math.max(1, ...blocks.map((b) => b.lane + 1))
  const totalDays = diffDays(range.to, range.from) + 1
  const todayPct = (diffDays(today, range.from) / totalDays) * 100
  const ticks = useMemo(() => {
    const list: { leftPct: number; label: string }[] = []
    for (let d = range.from; d <= range.to; d = addDays(d, 7)) {
      list.push({ leftPct: (diffDays(d, range.from) / totalDays) * 100, label: formatCn(d) })
    }
    return list
  }, [range, totalDays])

  const submitCreate = async (): Promise<void> => {
    if (!form.title.trim()) return
    // 失败时保持弹窗打开并把原因显示出来
    if (!(await create(form.title.trim(), form.start, form.end))) return
    setCreating(false)
    setForm({ title: '', start: today, end: addDays(today, 13) })
  }

  const barHeight = timelineBarHeight(expanded)
  const rowHeight = barHeight + TIMELINE_ROW_GAP
  const headerHeight = timelineHeight(expanded, laneCount)
  const gridHeight = timelineGridHeight(expanded, laneCount)

  return (
    <div className="flex items-center gap-3 w-full px-2" style={{ height: headerHeight }}>
      <button onClick={() => setExpanded(!expanded)} className="text-[var(--muted)] hover:text-[var(--text)] text-xs whitespace-nowrap">
        {expanded ? '收起 ⤡' : '展开 ⤢'}
      </button>
      <div className="flex-1 relative select-none">
        {ticks.map((t, i) => (
          <span key={i} className="absolute top-0 text-[9px] text-[var(--muted)] -translate-x-1/2" style={{ left: `${t.leftPct}%` }}>{t.label}</span>
        ))}
        <div
          className="relative w-full bg-[var(--border)] rounded overflow-y-auto overflow-x-hidden"
          style={{ height: gridHeight, marginTop: TIMELINE_TOP_PAD, maxHeight: TIMELINE_GRID_MAX_H }}
        >
          {blocks.map((b) => (
            <div
              key={b.id}
              onClick={() => setSelected(visible.find((t) => t.id === b.id) ?? null)}
              title={expanded ? undefined : b.title}
              className="absolute rounded cursor-pointer hover:brightness-125"
              style={{
                left: `${b.leftPct}%`,
                width: `${Math.max(b.widthPct, 0.5)}%`,
                top: 3 + b.lane * rowHeight,
                height: barHeight,
                background: b.color
              }}
            />
          ))}
          <div className="absolute top-0 bottom-0 w-[2px] bg-[#f39c12]" style={{ left: `${todayPct}%` }} />
        </div>
      </div>
      <select
        value={settings['timeline.rangeDays']}
        onChange={(e) => void setSetting('timeline.rangeDays', Number(e.target.value) as 7 | 30 | 90)}
        className="text-xs bg-[var(--card)] border border-[var(--border)] rounded px-1 py-1 text-[var(--muted)] whitespace-nowrap"
        title="时间轴显示范围"
      >
        <option value={7}>未来 7 天</option>
        <option value={30}>未来 30 天</option>
        <option value={90}>未来 90 天</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-[var(--muted)] whitespace-nowrap">
        <input
          type="checkbox"
          checked={settings['timeline.showDone']}
          onChange={(e) => void setSetting('timeline.showDone', e.target.checked)}
          className="accent-[var(--accent)]"
        />
        显示已完成
      </label>
      <button onClick={() => { clearError(); setCreating(true) }} className="text-xs bg-[var(--accent)] text-white rounded px-2 py-1 whitespace-nowrap">＋长期任务</button>

      {selected && (
        <div className="absolute z-50 top-11 right-40 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 shadow-xl w-56">
          <div className="font-bold text-sm mb-1">{selected.title}</div>
          <div className="text-xs text-[var(--muted)] mb-2">{formatCn(selected.start_date)} → {formatCn(selected.end_date)}（剩 {Math.max(0, diffDays(selected.end_date, today))} 天）</div>
          {selected.source_module && <div className="text-[10px] text-[var(--muted)] mb-2">来源：{SOURCE_LABEL[selected.source_module] ?? selected.source_module}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => { void setDone(selected.id, !selected.done).then((ok) => { if (ok) setSelected(null) }) }}
              className="text-xs px-2 py-1 rounded bg-[var(--border)]"
            >{selected.done ? '标记未完成' : '标记完成'}</button>
            <button onClick={() => { void remove(selected.id).then((ok) => { if (ok) setSelected(null) }) }} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">删除</button>
            <button onClick={() => { clearError(); setSelected(null) }} className="text-xs px-2 py-1 rounded bg-[var(--border)]">关闭</button>
          </div>
          {error && (
            <div className="flex items-start gap-2 mt-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
          )}
        </div>
      )}

      {creating && (
        <div className="absolute z-50 top-11 right-40 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 shadow-xl w-64">
          <div className="font-bold text-sm mb-2">新建长期任务</div>
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="任务名称" className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm mb-2 outline-none" />
          <div className="flex gap-2 mb-3 text-xs text-[var(--muted)] items-center">
            <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-1" />
            <span>→</span>
            <input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-1" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void submitCreate()} className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white">创建</button>
            <button onClick={() => { clearError(); setCreating(false) }} className="text-xs px-2 py-1 rounded bg-[var(--border)]">取消</button>
          </div>
          {error && (
            <div className="flex items-start gap-2 mt-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
