import type { MealItem } from '@shared/types'

const cellCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)]'

/** 食物编辑：名称 / 热量 / 蛋白 / 碳水 / 脂肪。受控组件，不直接落库。 */
export function MealItemEditor(props: {
  items: MealItem[]
  onChange: (items: MealItem[]) => void
}): JSX.Element {
  const { items } = props

  const patch = (i: number, next: Partial<MealItem>): void => {
    props.onChange(items.map((it, idx) => (idx === i ? { ...it, ...next } : it)))
  }

  const remove = (i: number): void => props.onChange(items.filter((_, idx) => idx !== i))

  const add = (): void => props.onChange([...items, { name: '', calories: 0, protein: 0, carbs: 0, fat: 0 }])

  const num = (v: string): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1.5">
          <input
            data-food-name={i}
            value={it.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="食物名称"
            className={`${cellCls} flex-1 min-w-0`}
          />
          <input
            data-food-calories={i}
            type="number" min={0} step={10}
            value={it.calories}
            onChange={(e) => patch(i, { calories: num(e.target.value) })}
            title="热量 kcal"
            className={`${cellCls} w-16`}
          />
          <span className="text-[9px] text-[var(--muted)]">kcal</span>
          <input
            data-food-protein={i}
            type="number" min={0} step={1}
            value={it.protein}
            onChange={(e) => patch(i, { protein: num(e.target.value) })}
            title="蛋白质 g"
            className={`${cellCls} w-12`}
          />
          <input
            data-food-carbs={i}
            type="number" min={0} step={1}
            value={it.carbs}
            onChange={(e) => patch(i, { carbs: num(e.target.value) })}
            title="碳水 g"
            className={`${cellCls} w-12`}
          />
          <input
            data-food-fat={i}
            type="number" min={0} step={1}
            value={it.fat}
            onChange={(e) => patch(i, { fat: num(e.target.value) })}
            title="脂肪 g"
            className={`${cellCls} w-12`}
          />
          <button
            onClick={() => remove(i)}
            className="text-[10px] text-[var(--muted)] hover:text-red-400 px-1"
            title="删除食物"
          >✕</button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          onClick={add}
          className="text-[10px] px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]"
        >＋ 添加食物</button>
        <span className="text-[9px] text-[var(--muted)]">蛋白 / 碳水 / 脂肪 单位 g（≤1000），热量 ≤10000 kcal</span>
      </div>
    </div>
  )
}
