import type { Event, Occurrence } from '@shared/types'

interface Props {
  occurrences: Occurrence[]
  anchor: string
  events: Event[]
  onPickDay: (date: string) => void
  onOpenEvent: (ev: Event) => void
}

// Task 9 会用完整的月历网格实现整体替换本文件
export function MonthView(_props: Props): JSX.Element {
  return <div className="p-4 text-xs text-[var(--muted)]">月视图将在 Task 9 实现</div>
}
