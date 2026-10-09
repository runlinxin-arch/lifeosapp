import { useEffect, useState } from 'react'
import type { ProjectStatus } from '@shared/types'
import { useDevStore, type DevView } from '../../stores/devStore'
import { ProjectList } from './ProjectList'
import { ProjectDetail } from './ProjectDetail'
import { SnippetView } from './SnippetView'
import { TechNoteView } from './TechNoteView'

const VIEWS: { key: DevView; label: string }[] = [
  { key: 'projects', label: '项目' },
  { key: 'snippets', label: '代码片段' },
  { key: 'notes', label: '技术笔记' }
]

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '开发中' },
  { value: 'paused', label: '暂停' },
  { value: 'done', label: '已完成' }
]

export function DevPage(): JSX.Element {
  const { view, setView, selectedProjectId, error, clearError, load, createProject } = useDevStore()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('planned')

  useEffect(() => { void load() }, [load])

  const submit = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    if (await createProject({ name: n, status })) {
      setName('')
      setStatus('planned')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 shrink-0">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              view === v.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]'
            }`}
          >{v.label}</button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
      )}

      {view === 'projects' && (
        <div className="flex-1 flex min-h-0">
          <section className="w-[38%] px-4 pb-4 border-r border-[var(--border)] overflow-auto">
            <h2 className="text-base font-bold mb-3">项目</h2>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2.5 mb-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
                placeholder="新建项目名称，回车确认"
                className="w-full mb-2 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <div className="flex items-center gap-2">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs outline-none"
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  onClick={() => void submit()}
                  className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white"
                >新建</button>
              </div>
            </div>

            <ProjectList />
          </section>

          <section className="flex-1 p-4 overflow-auto">
            {selectedProjectId === null
              ? <div className="text-xs text-[var(--muted)]">从左侧选择一个项目查看看板、Bug 与计时统计。</div>
              : <ProjectDetail projectId={selectedProjectId} />}
          </section>
        </div>
      )}

      {view === 'snippets' && <div className="flex-1 px-4 pb-4 overflow-auto"><SnippetView /></div>}
      {view === 'notes' && <div className="flex-1 px-4 pb-4 overflow-auto"><TechNoteView /></div>}
    </div>
  )
}
