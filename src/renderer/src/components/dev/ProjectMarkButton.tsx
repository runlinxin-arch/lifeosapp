import type { Project } from '@shared/types'
import { isMarkedFrom } from '@shared/longTaskSource'
import { useLongTasksStore } from '../../stores/longTasksStore'
import { useDevStore } from '../../stores/devStore'

/** 把开发项目标记到时间轴上（开发模块蓝 #3498db） */
export function ProjectMarkButton({ project }: { project: Project }): JSX.Element {
  const { tasks, markFromSource, unmarkSource, error, clearError } = useLongTasksStore()
  const devError = useDevStore((s) => s.error)

  const marked = isMarkedFrom(tasks, 'dev', project.id)
  const hasRange = !!project.start_date && !!project.end_date
  const shownError = error ?? devError

  const mark = async (): Promise<void> => {
    if (!hasRange) return
    await markFromSource({
      title: project.name,
      startDate: project.start_date!,
      endDate: project.end_date!,
      sourceModule: 'dev',
      sourceId: project.id
    })
  }

  return (
    <div className="flex items-center gap-2">
      {marked ? (
        <>
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: '#3498db', color: '#0b1f12' }}>
            已上轴
          </span>
          <button
            onClick={() => void unmarkSource('dev', project.id)}
            className="text-[10px] px-2 py-1 rounded bg-[var(--border)]"
          >取消标记</button>
        </>
      ) : (
        <button
          onClick={() => void mark()}
          disabled={!hasRange}
          title={hasRange ? '把该项目标记到时间轴' : '需先在下方设置起止日期'}
          className={`text-[10px] px-2 py-1 rounded ${
            hasRange ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--muted)] cursor-not-allowed'
          }`}
        >标记为长期任务</button>
      )}
      {!hasRange && <span className="text-[10px] text-[var(--muted)]">需先设起止日期</span>}
      {shownError && (
        <span className="text-[10px] text-red-300 flex items-center gap-1">
          {shownError}
          <button onClick={clearError} className="text-[var(--muted)]">✕</button>
        </span>
      )}
    </div>
  )
}
