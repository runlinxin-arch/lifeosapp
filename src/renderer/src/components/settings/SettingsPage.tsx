import { useEffect, type ReactNode } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { DEFAULT_ACCENT } from '@shared/settings'

/** 预设主题色：默认强调色 + 各模块色 + 独立灰 */
const ACCENTS = [DEFAULT_ACCENT, '#4ade80', '#3498db', '#e879c9', '#e74c3c', '#f39c12', '#8b8d98']

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

  useEffect(() => { void load() }, [load])

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-bold mb-4">设置和数据</h1>

      <Card title="外观">
        <Row label="主题模式">
          <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => void set('theme.mode', 'dark')}
              className={`px-4 py-1.5 text-sm ${settings['theme.mode'] === 'dark' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)]'}`}
            >深色</button>
            <button
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
        {settings['theme.custom'] && (
          <Row label="网站主题">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">已应用网站风格主题，覆盖了基础色板</span>
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
          <button disabled className="px-3 py-1.5 text-sm rounded bg-[var(--border)] opacity-50 cursor-not-allowed">导出数据包</button>
          <button disabled className="px-3 py-1.5 text-sm rounded bg-[var(--border)] opacity-50 cursor-not-allowed">导入数据包</button>
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">导出 / 导入（含灵感图片）即将开放。</p>
      </Card>

      {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
    </div>
  )
}
