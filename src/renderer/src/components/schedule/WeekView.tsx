import type { Event, Occurrence } from '@shared/types'

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onCreateAt: (start?: string) => void
  onEdit: (ev: Event) => void
}

// Task 8 会用完整的时间网格实现整体替换本文件
export function WeekView(_props: Props): JSX.Element {
  return <div className="p-4 text-xs text-[var(--muted)]">周视图将在 Task 8 实现</div>
}
