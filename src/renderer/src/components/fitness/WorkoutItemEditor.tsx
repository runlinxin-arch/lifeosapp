import type { WorkoutItem } from '@shared/types'

const cellCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 动作编辑：名称 / 重量 / 组数 / 次数。受控组件，不直接落库。 */
export function WorkoutItemEditor(props: {
  items: WorkoutItem[]
  onChange: (items: WorkoutItem[]) => void
}): JSX.Element {
  const { items } = props

  const patch = (i: number, next: Partial<WorkoutItem>): void => {
    props.onChange(items.map((it, idx) => (idx === i ? { ...it, ...next } : it)))
  }

  const remove = (i: number): void => props.onChange(items.filter((_, idx) => idx !== i))

  const add = (): void => props.onChange([...items, { name: '', weight: 0, sets: 3, reps: 10 }])

  const num = (v: string): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1.5">
          <input
            data-item-name={i}
            value={it.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="动作名称"
            className={`${cellCls} flex-1`}
          />
          <input
            data-item-weight={i}
            type="number" min={0} step={2.5}
            value={it.weight}
            onChange={(e) => patch(i, { weight: num(e.target.value) })}
            title="重量 kg"
            className={`${cellCls} w-16`}
          />
          <span className="text-[9px] text-[var(--muted)]">kg ×</span>
          <input
            data-item-sets={i}
            type="number" min={1}
            value={it.sets}
            onChange={(e) => patch(i, { sets: num(e.target.value) })}
            title="组数"
            className={`${cellCls} w-12`}
          />
          <span className="text-[9px] text-[var(--muted)]">组 ×</span>
          <input
            data-item-reps={i}
            type="number" min={1}
            value={it.reps}
            onChange={(e) => patch(i, { reps: num(e.target.value) })}
            title="每组次数"
            className={`${cellCls} w-12`}
          />
          <span className="text-[9px] text-[var(--muted)]">次</span>
          <button
            onClick={() => remove(i)}
            className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1"
            title="删除动作"
          >✕</button>
        </div>
      ))}

      <button onClick={add} className="text-[10px] px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]">
        ＋ 添加动作
      </button>
    </div>
  )
}
