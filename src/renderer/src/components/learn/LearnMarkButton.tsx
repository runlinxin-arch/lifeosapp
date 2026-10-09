import type { LearnItem } from '@shared/types'
import { isMarkedFrom } from '@shared/longTaskSource'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { useLearnStore } from '../../stores/learnStore'

export function LearnMarkButton({ item }: { item: LearnItem }): JSX.Element {
  const { tasks, markFromSource, unmarkSource, error, clearError } = useLongTasksStore()
  const learnError = useLearnStore((s) => s.error)

  const marked = isMarkedFrom(tasks, 'learning', item.id)
  const hasRange = !!item.start_date && !!item.end_date
  const shownError = error ?? learnError

  const mark = async (): Promise<void> => {
    if (!hasRange) return
    await markFromSource({
      title: item.title,
      startDate: item.start_date!,
      endDate: item.end_date!,
      sourceModule: 'learning',
      sourceId: item.id
    })
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="text-xs text-[var(--muted)] mb-2">长期任务</div>
      <div className="flex items-center gap-2">
        {marked ? (
          <>
            <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#4ade80', color: '#0b1f12' }}>
              已上轴
            </span>
            <button
              onClick={() => { void unmarkSource('learning', item.id) }}
              className="text-xs px-2 py-1 rounded bg-[var(--border)]"
            >取消标记</button>
          </>
        ) : (
          <button
            onClick={() => void mark()}
            disabled={!hasRange}
            className={`text-xs px-3 py-1.5 rounded ${
              hasRange ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--muted)] cursor-not-allowed'
            }`}
          >标记为长期任务</button>
        )}
        {!hasRange && <span className="text-[10px] text-[var(--muted)]">需先设置起止日期</span>}
        {marked && <span className="text-[10px] text-[var(--muted)]">时间轴上显示为学习模块绿</span>}
      </div>
      {shownError && (
        <div className="flex items-start gap-2 mt-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
          <span className="flex-1">{shownError}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}
    </div>
  )
}
