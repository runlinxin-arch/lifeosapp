import { useEffect, useRef, useState } from 'react'
import type { BodyMetric } from '@shared/types'
import { latestMetric, linePath, toSvgPoints } from '@shared/fitnessStats'
import { useFitnessStore } from '../../stores/fitnessStore'
import { todayStr } from '@shared/dates'

const H = 120
const FAT_H = 64
const PAD = 8
const WEIGHT_COLOR = '#e74c3c'
const FAT_COLOR = '#f39c12'

/** 体重体脂趋势：SVG 折线，宽度自适应容器 */
export function BodyTrend(): JSX.Element {
  const metrics = useFitnessStore((s) => s.metrics)
  const saveMetric = useFitnessStore((s) => s.saveMetric)

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  // 图表按容器实际宽度绘制，避免固定 viewBox 被等比缩放后两侧留白
  const boxRef = useRef<HTMLDivElement>(null)
  const [chartW, setChartW] = useState(320)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const apply = (): void => setChartW(Math.max(160, Math.round(el.clientWidth)))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const latest = latestMetric(metrics)
  const prev = metrics.length >= 2 ? metrics[metrics.length - 2] : null
  const delta = latest && prev ? +(latest.weight - prev.weight).toFixed(1) : null

  const weightPts = toSvgPoints(metrics.map((m) => ({ date: m.date, value: m.weight })), chartW, H, PAD)
  const fatRows = metrics.filter((m) => m.body_fat !== null)
  const fatPts = toSvgPoints(fatRows.map((m) => ({ date: m.date, value: m.body_fat as number })), chartW, FAT_H, PAD)

  const openDialog = (): void => {
    setDate(todayStr())
    setWeight(latest ? String(latest.weight) : '')
    setBodyFat(latest?.body_fat != null ? String(latest.body_fat) : '')
    setOpen(true)
  }

  const submit = async (): Promise<void> => {
    const w = Number(weight)
    if (!Number.isFinite(w) || w <= 0) return
    const fat = bodyFat.trim() === '' ? null : Number(bodyFat)
    const ok = await saveMetric({ date, weight: w, bodyFat: fat })
    if (ok) setOpen(false)
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold">📉 体重体脂</span>
        <button
          data-action="record-metric"
          onClick={openDialog}
          className="ml-auto text-[10px] px-2 py-1 rounded text-white"
          style={{ background: WEIGHT_COLOR }}
        >记录</button>
      </div>

      {latest && (
        <div className="flex items-center gap-3 text-xs mb-2">
          <span>最新 <b>{latest.weight}</b> kg</span>
          {latest.body_fat != null && <span className="text-[var(--muted)]">体脂 {latest.body_fat}%</span>}
          {delta !== null && (
            <span className={delta > 0 ? 'text-red-300' : delta < 0 ? 'text-green-300' : 'text-[var(--muted)]'}>
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} {Math.abs(delta)} kg
            </span>
          )}
        </div>
      )}

      <div ref={boxRef} data-chart-box="true">
      {metrics.length < 2 ? (
        <div className="text-[10px] text-[var(--muted)] py-6 text-center">
          至少记录两天才能画出趋势（当前 {metrics.length} 天）
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1 text-[9px] text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: WEIGHT_COLOR }} /> 体重 (kg)
            </span>
          </div>
          <svg width={chartW} height={H} viewBox={`0 0 ${chartW} ${H}`} className="block" data-chart="body-weight">
            <path d={linePath(weightPts)} fill="none" stroke={WEIGHT_COLOR} strokeWidth={1.5} />
            {weightPts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2} fill={WEIGHT_COLOR} />
            ))}
          </svg>

          {fatPts.length >= 2 && (
            <>
              <div className="flex items-center gap-2 mt-2 mb-1 text-[9px] text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5" style={{ background: FAT_COLOR }} /> 体脂 (%)
                </span>
              </div>
              <svg width={chartW} height={FAT_H} viewBox={`0 0 ${chartW} ${FAT_H}`} className="block" data-chart="body-fat">
                <path d={linePath(fatPts)} fill="none" stroke={FAT_COLOR} strokeWidth={1.2} strokeDasharray="4 3" />
                {fatPts.map((p, i) => (
                  <circle key={`f${i}`} cx={p.x} cy={p.y} r={1.5} fill={FAT_COLOR} />
                ))}
              </svg>
            </>
          )}
        </>
      )}
      </div>

      <div className="mt-1 flex items-center justify-end text-[9px] text-[var(--muted)]">
        <span>{metrics.length} 天记录</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-[360px] bg-[var(--card)] border border-[var(--border)] rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center mb-3">
              <span className="text-sm font-bold">记录身体数据</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-[var(--muted)]">✕</button>
            </div>
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="w-12 text-[var(--muted)]">日期</span>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 outline-none"
              />
            </div>
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="w-12 text-[var(--muted)]">体重 kg</span>
              <input
                data-metric-weight
                type="number" step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 outline-none"
              />
            </div>
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="w-12 text-[var(--muted)]">体脂 %</span>
              <input
                data-metric-fat
                type="number" step={0.1} value={bodyFat} onChange={(e) => setBodyFat(e.target.value)}
                placeholder="可留空"
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 outline-none"
              />
            </div>
            <div className="text-[9px] text-[var(--muted)] mb-2">同一天再次保存会覆盖当天记录</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
              <button
                data-action="submit-metric"
                onClick={() => void submit()}
                className="text-xs px-4 py-1.5 rounded text-white"
                style={{ background: WEIGHT_COLOR }}
              >保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
