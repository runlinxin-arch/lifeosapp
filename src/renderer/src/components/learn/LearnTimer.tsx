import { useEffect, useRef, useState } from 'react'
import { elapsedToMinutes, formatElapsed } from '@shared/duration'
import { useLearnStore } from '../../stores/learnStore'
import { useToday } from '../../hooks/useToday'

export function LearnTimer({ itemId }: { itemId: number }): JSX.Element {
  const createSession = useLearnStore((s) => s.createSession)
  const today = useToday()
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (startedAt === null) {
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = null
      return
    }
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [startedAt])

  // 切换学习项时丢弃未结束的计时（不产生悬挂会话）
  useEffect(() => { setStartedAt(null); setElapsed(0) }, [itemId])

  const start = (): void => { setElapsed(0); setStartedAt(Date.now()) }

  const stop = async (): Promise<void> => {
    if (startedAt === null) return
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    setStartedAt(null)
    setElapsed(0)
    await createSession(itemId, today, elapsedToMinutes(seconds))
  }

  const running = startedAt !== null

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-3">
      <div className="text-xs text-[var(--muted)] mb-2">学习计时</div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-mono tabular-nums" style={{ color: running ? '#4ade80' : undefined }}>
          {formatElapsed(elapsed)}
        </span>
        {running
          ? <button onClick={() => void stop()} className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-300">停止并记录</button>
          : <button onClick={start} className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white">开始</button>}
        <span className="text-[10px] text-[var(--muted)] ml-auto">停止时记录一条学习时长（至少 1 分钟）</span>
      </div>
    </div>
  )
}
