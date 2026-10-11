import { useEffect, useState } from 'react'
import { formatElapsed } from '@shared/duration'
import { useDevTimerStore } from '../../stores/devTimerStore'
import { useModuleColors } from '../../hooks/useModuleColors'

/** 常驻计时器：跨页签、跨页面切换都不消失（状态在 store 里） */
export function DevTimer(): JSX.Element | null {
  const running = useDevTimerStore((s) => s.running)
  const stop = useDevTimerStore((s) => s.stop)
  const cancel = useDevTimerStore((s) => s.cancel)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const mc = useModuleColors()

  useEffect(() => {
    if (!running) { setElapsed(0); return }
    const tick = (): void => setElapsed(Math.floor((Date.now() - running.startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running])

  if (!running) return null

  const onStop = async (): Promise<void> => {
    setBusy(true)
    await stop()
    setBusy(false)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ borderColor: '#3498db', background: '#3498db1a' }}>
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3498db' }} />
      <span className="text-xs text-[var(--muted)] max-w-[160px] truncate" title={running.taskTitle}>
        {running.taskTitle}
      </span>
      <span className="text-sm font-mono tabular-nums" style={{ color: mc.dev }}>{formatElapsed(elapsed)}</span>
      <button
        onClick={() => void onStop()}
        disabled={busy}
        className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)] text-white disabled:opacity-50"
      >{busy ? '记录中…' : '停止'}</button>
      <button
        onClick={cancel}
        title="放弃本次计时（不记录）"
        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)]"
      >✕</button>
    </div>
  )
}
