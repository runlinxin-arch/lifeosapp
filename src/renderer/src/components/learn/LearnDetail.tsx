import { useLearnStore } from '../../stores/learnStore'

// Task 6 会用完整实现整体替换本文件
export function LearnDetail({ itemId }: { itemId: number }): JSX.Element {
  const item = useLearnStore((s) => s.items.find((i) => i.id === itemId))
  return (
    <div className="text-xs text-[var(--muted)]">
      学习项详情将在 Task 6 实现（id={itemId}
      {item ? ` · ${item.title}` : ''}）
    </div>
  )
}
