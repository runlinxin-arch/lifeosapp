import { useEffect, useState, type ReactNode } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { api } from '../../lib/ipc'
import { applyTheme } from '../../lib/theme'
import { formatIpcError } from '../../lib/errors'
import { DEFAULT_ACCENT, type ThemePalette } from '@shared/settings'

/** 预设主题色：默认强调色 + 各模块色 + 独立灰 */
const ACCENTS = [DEFAULT_ACCENT, '#4ade80', '#3498db', '#e879c9', '#e74c3c', '#f39c12', '#8b8d98']

const PALETTE_KEYS = ['bg', 'card', 'border', 'accent', 'text', 'muted'] as const

function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 mb-4">
      <h2 className="text-sm font-bold mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-start gap-3 mb-3 last:mb-0">
      <span className="text-sm text-[var(--muted)] w-24 shrink-0 leading-7">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const inputCls = 'bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]'

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const error = useSettingsStore((s) => s.error)
  const load = useSettingsStore((s) => s.load)
  const set = useSettingsStore((s) => s.set)

  const [url, setUrl] = useState('')
  const [pending, setPending] = useState<ThemePalette | null>(null)
  const [fetching, setFetching] = useState(false)
  const [styleError, setStyleError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dataMsg, setDataMsg] = useState<string | null>(null)

  useEffect(() => { void load() }, [load])

  const doFetch = async (): Promise<void> => {
    setStyleError(null)
    setPending(null)
    if (!url.trim()) { setStyleError('请输入网址'); return }
    setFetching(true)
    try {
      setPending(await api.theme.fetchStyle(url.trim()))
    } catch (e) {
      setStyleError(formatIpcError(e))
    } finally {
      setFetching(false)
    }
  }

  const previewPending = (): void => {
    if (!pending) return
    applyTheme({ 'theme.mode': settings['theme.mode'], 'theme.accent': pending.accent, 'theme.custom': pending })
  }

  const doExport = async (): Promise<void> => {
    setDataMsg(null)
    setExporting(true)
    try {
      const r = await api.data.export()
      setDataMsg(r.canceled ? '已取消导出' : `已导出到：${r.file}`)
    } catch (e) {
      setDataMsg(formatIpcError(e))
    } finally {
      setExporting(false)
    }
  }

  const doImport = async (): Promise<void> => {
    setDataMsg(null)
    setImporting(true)
    try {
      const r = await api.data.import()
      if (r.canceled) setDataMsg('已取消导入')
      else if (r.ok) setDataMsg('导入成功，应用即将重启…')
      else setDataMsg(r.error ?? '导入失败')
    } catch (e) {
      setDataMsg(formatIpcError(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-bold mb-4">设置和数据</h1>

      <Card title="外观">
        <Row label="主题模式">
          <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
            <button
              data-theme-mode="dark"
              onClick={() => void set('theme.mode', 'dark')}
              className={`px-4 py-1.5 text-sm ${settings['theme.mode'] === 'dark' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]'}`}
            >深色</button>
            <button
              data-theme-mode="light"
              onClick={() => void set('theme.mode', 'light')}
              className={`px-4 py-1.5 text-sm ${settings['theme.mode'] === 'light' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]'}`}
            >浅色</button>
          </div>
        </Row>
        <Row label="主题色">
          <div className="flex items-center gap-2 flex-wrap">
            {ACCENTS.map((c) => (
              <button
                key={c}
                data-accent={c}
                onClick={() => void set('theme.accent', c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: settings['theme.accent'] === c ? 'var(--text)' : 'transparent' }}
                title={c}
                aria-label={`主题色 ${c}`}
              />
            ))}
            <input
              type="color"
              value={settings['theme.accent']}
              onChange={(e) => void set('theme.accent', e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent"
              title="自定义主题色"
            />
          </div>
        </Row>

        <Row label="网站风格">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                data-style-url
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void doFetch() }}
                placeholder="粘贴网址，抓取配色生成主题（如 https://example.com）"
                className={`${inputCls} flex-1`}
              />
              <button
                data-style-fetch
                onClick={() => void doFetch()}
                disabled={fetching}
                className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
              >{fetching ? '抓取中…' : '抓取'}</button>
            </div>

            {pending && (
              <div className="rounded border border-[var(--border)] p-3">
                <div className="flex items-center gap-2 mb-2">
                  {PALETTE_KEYS.map((k) => (
                    <span
                      key={k}
                      className="w-8 h-8 rounded border border-[var(--border)]"
                      style={{ background: pending[k] }}
                      title={`${k}: ${pending[k]}`}
                    />
                  ))}
                  <span className="text-xs text-[var(--muted)]">抓取到的配色（bg / card / border / accent / text / muted）</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={previewPending} className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white">预览</button>
                  <button
                    onClick={() => { void set('theme.custom', pending); setPending(null) }}
                    className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white"
                  >应用此主题</button>
                  <button
                    onClick={() => { applyTheme(settings); setPending(null) }}
                    className="text-xs px-2 py-1 rounded bg-[var(--border)]"
                  >放弃</button>
                </div>
              </div>
            )}

            {styleError && (
              <div className="text-xs text-red-400">{styleError} —— 可改用上方的「主题模式 / 主题色」手动选色</div>
            )}
          </div>
        </Row>

        {settings['theme.custom'] && (
          <Row label="已应用">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">当前使用网站风格主题，覆盖了基础色板</span>
              <button
                onClick={() => void set('theme.custom', null)}
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >清除，恢复默认</button>
            </div>
          </Row>
        )}
      </Card>

      <Card title="提醒">
        <Row label="提醒开关">
          <label className="flex items-center gap-2 text-sm">
            <input
              data-remind-enabled
              type="checkbox"
              checked={settings['remind.enabled']}
              onChange={(e) => void set('remind.enabled', e.target.checked)}
              className="accent-[var(--accent)]"
            />
            到期前发系统通知
          </label>
        </Row>
        <Row label="提前分钟数">
          <input
            data-remind-lead
            type="number"
            min={0}
            max={1440}
            value={settings['remind.leadMinutes']}
            onChange={(e) => void set('remind.leadMinutes', Number(e.target.value))}
            className={`${inputCls} w-24`}
          />
          <span className="ml-2 text-xs text-[var(--muted)]">新建日程事件的默认提前量（0–1440）</span>
        </Row>
      </Card>

      <Card title="时间轴">
        <Row label="显示范围">
          <select
            data-timeline-range
            value={settings['timeline.rangeDays']}
            onChange={(e) => void set('timeline.rangeDays', Number(e.target.value) as 7 | 30 | 90)}
            className={inputCls}
          >
            <option value={7}>未来 7 天</option>
            <option value={30}>未来 30 天</option>
            <option value={90}>未来 90 天</option>
          </select>
        </Row>
        <Row label="已完成任务">
          <label className="flex items-center gap-2 text-sm">
            <input
              data-timeline-showdone
              type="checkbox"
              checked={settings['timeline.showDone']}
              onChange={(e) => void set('timeline.showDone', e.target.checked)}
              className="accent-[var(--accent)]"
            />
            显示已完成的长期任务
          </label>
        </Row>
      </Card>

      <Card title="数据">
        <div className="flex gap-2">
          <button
            data-export
            onClick={() => void doExport()}
            disabled={exporting}
            className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
          >{exporting ? '导出中…' : '导出数据包'}</button>
          <button
            data-import
            onClick={() => void doImport()}
            disabled={importing}
            className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50"
          >{importing ? '导入中…' : '导入数据包'}</button>
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">导出会把数据库与灵感图片打包成一个 .tar.gz；导入前会自动备份当前数据，失败可回退。</p>
        {dataMsg && <div className="text-sm text-[var(--accent)] mt-2">{dataMsg}</div>}
      </Card>

      {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
    </div>
  )
}
