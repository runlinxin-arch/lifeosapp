/** 五星评分：点第 n 颗设为 n；再点同一颗清零（回到未评分 0） */
export function StarRating({ value, onChange, testId }: {
  value: number
  onChange: (v: number) => void
  testId: string
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5" data-star-rating={testId} data-rating={value}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          data-star={n}
          onClick={() => onChange(value === n ? 0 : n)}
          title={`${n} 星${value === n ? '（再点取消）' : ''}`}
          className="text-sm leading-none px-0.5 transition-colors"
          style={{ color: n <= value ? '#f1c40f' : 'var(--border)' }}
        >★</button>
      ))}
    </span>
  )
}
