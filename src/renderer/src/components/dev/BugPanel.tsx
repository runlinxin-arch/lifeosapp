import { useState } from 'react'
import type { Bug, BugStatus, Priority } from '@shared/types'
import { useDevStore } from '../../stores/devStore'

/** 状态灯：未修红 / 修复中琥珀 / 已修复绿 */
const STATUS_META: Record<BugStatus, { label: string; color: string }> = {
  open: { label: '未修', color: '#e74c3c' },
  fixing: { label: '修复中', color: '#f39c12' },
  fixed: { label: '已修复', color: '#4ade80' }
}
const STATUS_ORDER: BugStatus[] = ['open', 'fixing', 'fixed']
const PRIORITY_LABEL: Record<Priority, string> = { high: '高', mid: '中', low: '低' }
const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'

export function BugPanel({ projectId }: { projectId: number }): JSX.Element {
  const bugs = useDevStore((s) => s.bugs)
  const createBug = useDevStore((s) => s.createBug)
  const updateBug = useDevStore((s) => s.updateBug)
  const removeBug = useDevStore((s) => s.removeBug)

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [descDraft, setDescDraft] = useState('')

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) return
    if (await createBug({ projectId, title: t, priority })) {
      setTitle('')
      setPriority('mid')
    }
  }

  const counts = STATUS_ORDER.map((s) => ({ status: s, n: bugs.filter((b) => b.status === s).length }))
  const openCount = bugs.filter((b) => b.status !== 'fixed').length

  return (
    <div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            placeholder="记录一个 Bug，回车确认"
            className={`flex-1 ${inputCls} py-1.5`}
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputCls}
            title="优先级"
          >
            {(['high', 'mid', 'low'] as Priority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
          <button onClick={() => void submit()} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">
            新建
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--muted)]">
          {counts.map((c) => (
            <span key={c.status} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_META[c.status].color }} />
              {STATUS_META[c.status].label} {c.n}
            </span>
          ))}
          <span className="ml-auto">未修合计 {openCount}</span>
        </div>
      </div>

      {bugs.map((b) => (
        <BugRow
          key={b.id}
          bug={b}
          expanded={expanded === b.id}
          descDraft={descDraft}
          onDescDraft={setDescDraft}
          onToggle={() => {
            setExpanded(expanded === b.id ? null : b.id)
            setDescDraft(b.description)
          }}
          onStatus={(status) => void updateBug(b.id, { status })}
          onPriority={(p) => void updateBug(b.id, { priority: p })}
          onSaveDesc={async () => {
            if (await updateBug(b.id, { description: descDraft })) setExpanded(null)
          }}
          onDelete={() => void removeBug(b.id)}
        />
      ))}

      {bugs.length === 0 && (
        <div className="text-center text-[var(--muted)] text-xs py-6">还没有 Bug 记录</div>
      )}
    </div>
  )
}

function BugRow(props: {
  bug: Bug
  expanded: boolean
  descDraft: string
  onDescDraft: (v: string) => void
  onToggle: () => void
  onStatus: (s: BugStatus) => void
  onPriority: (p: Priority) => void
  onSaveDesc: () => void
  onDelete: () => void
}): JSX.Element {
  const { bug } = props
  const meta = STATUS_META[bug.status]
  const fixed = bug.status === 'fixed'

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg mb-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
        <button
          onClick={props.onToggle}
          className={`flex-1 text-left text-xs break-words ${fixed ? 'line-through text-[var(--muted)]' : ''}`}
        >{bug.title}</button>

        <select
          value={bug.priority}
          onChange={(e) => props.onPriority(e.target.value as Priority)}
          className={inputCls}
          title="优先级"
        >
          {(['high', 'mid', 'low'] as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>

        <div className="flex items-center gap-0.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => props.onStatus(s)}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: bug.status === s ? STATUS_META[s].color : 'var(--border)',
                color: bug.status === s ? '#12131a' : 'var(--muted)'
              }}
            >{STATUS_META[s].label}</button>
          ))}
        </div>

        <button
          onClick={props.onDelete}
          className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1"
          title="删除"
        >✕</button>
      </div>

      {props.expanded && (
        <div className="mt-2">
          <textarea
            value={props.descDraft}
            onChange={(e) => props.onDescDraft(e.target.value)}
            placeholder="现象 / 复现步骤"
            rows={3}
            className={`w-full ${inputCls} resize-y`}
          />
          <div className="mt-1 flex gap-2">
            <button onClick={props.onSaveDesc} className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)] text-white">
              保存现象
            </button>
            <button onClick={props.onToggle} className="text-[10px] px-2 py-0.5 rounded bg-[var(--border)]">取消</button>
          </div>
        </div>
      )}

      {!props.expanded && bug.description && (
        <div className="mt-1 text-[10px] text-[var(--muted)] whitespace-pre-wrap break-words line-clamp-2">
          {bug.description}
        </div>
      )}
    </div>
  )
}
