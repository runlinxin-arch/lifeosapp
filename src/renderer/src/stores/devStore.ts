import { create } from 'zustand'
import type {
  Bug, BugInput, BugPatch, DevColumn, DevSession, DevTask, DevTaskInput, DevTaskPatch,
  Project, ProjectInput, ProjectPatch, Snippet, SnippetInput, SnippetPatch,
  TechNote, TechNoteInput, TechNotePatch
} from '@shared/types'
import type { SnippetFilter } from '@shared/snippetFilter'
import { api, type ProjectStats } from '../lib/ipc'
import { formatIpcError } from '../lib/errors'

export type DevView = 'projects' | 'snippets' | 'notes'

interface DevState {
  view: DevView
  projects: Project[]
  stats: Map<number, ProjectStats>
  /** 当前选中项目的看板与 Bug */
  tasks: DevTask[]
  bugs: Bug[]
  /** 全部项目的任务，供本周计时做 task → project 映射 */
  allTasks: DevTask[]
  snippets: Snippet[]
  notes: TechNote[]
  /** 全部开发计时记录（用于本周汇总与统计页签） */
  sessions: DevSession[]
  snippetFilter: SnippetFilter
  selectedProjectId: number | null
  loading: boolean
  error: string | null

  clearError: () => void
  setView: (view: DevView) => void
  setSnippetFilter: (filter: SnippetFilter) => void
  selectProject: (id: number | null) => Promise<void>
  load: () => Promise<boolean>

  createProject: (input: ProjectInput) => Promise<boolean>
  updateProject: (id: number, patch: ProjectPatch) => Promise<boolean>
  removeProject: (id: number) => Promise<boolean>

  createTask: (input: DevTaskInput) => Promise<boolean>
  updateTask: (id: number, patch: DevTaskPatch) => Promise<boolean>
  removeTask: (id: number) => Promise<boolean>
  moveTask: (id: number, column: DevColumn, index: number) => Promise<boolean>

  createBug: (input: BugInput) => Promise<boolean>
  updateBug: (id: number, patch: BugPatch) => Promise<boolean>
  removeBug: (id: number) => Promise<boolean>

  createSnippet: (input: SnippetInput) => Promise<boolean>
  updateSnippet: (id: number, patch: SnippetPatch) => Promise<boolean>
  removeSnippet: (id: number) => Promise<boolean>

  createNote: (input: TechNoteInput) => Promise<boolean>
  updateNote: (id: number, patch: TechNotePatch) => Promise<boolean>
  removeNote: (id: number) => Promise<boolean>

  createSession: (taskId: number, startedAt: string, endedAt: string, minutes: number) => Promise<boolean>
  removeSession: (id: number) => Promise<boolean>
}

export const useDevStore = create<DevState>((set, get) => {
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    try {
      await action()
      set({ error: null, loading: false })
      return true
    } catch (e) {
      set({ error: formatIpcError(e), loading: false })
      return false
    }
  }

  const fetchProjects = async (): Promise<void> => {
    const [projects, statsPairs] = await Promise.all([api.dev.listProjects(), api.dev.listProjectStats()])
    set({ projects, stats: new Map(statsPairs) })
  }
  const fetchSnippets = async (): Promise<void> => set({ snippets: await api.dev.listSnippets() })
  const fetchNotes = async (): Promise<void> => set({ notes: await api.dev.listNotes() })
  const fetchSessions = async (): Promise<void> => set({ sessions: await api.dev.listSessions() })
  const fetchAllTasks = async (): Promise<void> => set({ allTasks: await api.dev.listAllTasks() })

  /** 重新拉取当前选中项目的看板与 Bug */
  const fetchProjectDetail = async (): Promise<void> => {
    const id = get().selectedProjectId
    if (id === null) {
      set({ tasks: [], bugs: [] })
      return
    }
    const [tasks, bugs] = await Promise.all([api.dev.listTasks(id), api.dev.listBugs(id)])
    set({ tasks, bugs })
  }

  /** 项目结构或统计口径变化后统一刷新 */
  const refreshProjects = async (): Promise<void> => {
    await Promise.all([fetchProjects(), fetchSessions(), fetchAllTasks()])
    await fetchProjectDetail()
  }

  return {
    view: 'projects',
    projects: [],
    stats: new Map(),
    tasks: [],
    bugs: [],
    allTasks: [],
    snippets: [],
    notes: [],
    sessions: [],
    snippetFilter: {},
    selectedProjectId: null,
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setView: (view) => set({ view }),
    setSnippetFilter: (snippetFilter) => set({ snippetFilter }),

    selectProject: async (id) => {
      set({ selectedProjectId: id })
      await run(fetchProjectDetail)
    },

    load: () => run(async () => {
      set({ loading: true })
      await Promise.all([fetchProjects(), fetchSnippets(), fetchNotes(), fetchSessions(), fetchAllTasks()])
      const { selectedProjectId, projects } = get()
      // 选中的项目被删掉时自动退回未选中
      const stillExists = selectedProjectId !== null && projects.some((p) => p.id === selectedProjectId)
      if (!stillExists) set({ selectedProjectId: null })
      await fetchProjectDetail()
    }),

    createProject: (input) => run(async () => { await api.dev.createProject(input); await fetchProjects() }),
    updateProject: (id, patch) => run(async () => { await api.dev.updateProject(id, patch); await fetchProjects() }),
    removeProject: (id) => run(async () => {
      await api.dev.removeProject(id)
      if (get().selectedProjectId === id) set({ selectedProjectId: null, tasks: [], bugs: [] })
      await refreshProjects()
    }),

    createTask: (input) => run(async () => {
      await api.dev.createTask(input)
      await refreshProjects()
    }),
    updateTask: (id, patch) => run(async () => {
      await api.dev.updateTask(id, patch)
      await refreshProjects()
    }),
    removeTask: (id) => run(async () => {
      await api.dev.removeTask(id)
      await refreshProjects()
    }),
    moveTask: (id, column, index) => run(async () => {
      // moveTask 直接返回该项目最新看板，省一次往返
      set({ tasks: await api.dev.moveTask(id, column, index) })
      await Promise.all([fetchProjects(), fetchSessions(), fetchAllTasks()])
    }),

    createBug: (input) => run(async () => { await api.dev.createBug(input); await refreshProjects() }),
    updateBug: (id, patch) => run(async () => { await api.dev.updateBug(id, patch); await refreshProjects() }),
    removeBug: (id) => run(async () => { await api.dev.removeBug(id); await refreshProjects() }),

    createSnippet: (input) => run(async () => { await api.dev.createSnippet(input); await fetchSnippets() }),
    updateSnippet: (id, patch) => run(async () => { await api.dev.updateSnippet(id, patch); await fetchSnippets() }),
    removeSnippet: (id) => run(async () => { await api.dev.removeSnippet(id); await fetchSnippets() }),

    createNote: (input) => run(async () => { await api.dev.createNote(input); await fetchNotes() }),
    updateNote: (id, patch) => run(async () => { await api.dev.updateNote(id, patch); await fetchNotes() }),
    removeNote: (id) => run(async () => { await api.dev.removeNote(id); await fetchNotes() }),

    createSession: (taskId, startedAt, endedAt, minutes) => run(async () => {
      await api.dev.createSession(taskId, startedAt, endedAt, minutes)
      await Promise.all([fetchSessions(), fetchProjects()])
    }),
    removeSession: (id) => run(async () => {
      await api.dev.removeSession(id)
      await Promise.all([fetchSessions(), fetchProjects()])
    })
  }
})
