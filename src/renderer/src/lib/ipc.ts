import type {
  BoardInput, BoardPatch, BodyMetric, BodyMetricInput, Bug, BugInput, BugPatch, CaptureInput,
  DevColumn, DevSession, DevTask, DevTaskInput, DevTaskPatch,
  Event, EventInput, EventPatch, Inspiration, InspirationBoard, InspirationInput, InspirationPatch,
  LearnItem, LearnItemInput, LearnItemPatch,
  LearnNote, LearnSession, LongTask, LongTaskPatch, MarkFromSourceInput,
  Meal, MealInput, MealPlan, MealPlanInput, MealType,
  ModuleKey, Occurrence, Priority, Project, ProjectInput, ProjectPatch, Snippet, SnippetInput, SnippetPatch,
  Task, TechNote, TechNoteInput, TechNotePatch,
  WorkoutLog, WorkoutLogInput, WorkoutLogPatch, WorkoutPlan, WorkoutPlanInput, WorkoutPlanPatch
} from '@shared/types'
import type { Settings, SettingsKey, ThemePalette } from '@shared/settings'
import type { SnippetFilter } from '@shared/snippetFilter'
import type { InspirationFilter } from '@shared/inspirationFilter'

export interface ProjectStats { taskTotal: number; taskDone: number; openBugs: number; minutes: number }
export interface BoardStat { count: number; coverImage: string | null }

export interface TaskPatch { title?: string; done?: boolean; priority?: Priority }
export interface TaskInput { title: string; priority?: Priority; date: string }
export interface LongTaskInput { title: string; startDate: string; endDate: string; color?: string }
export interface ConvertTaskInput {
  startAt: string
  endAt: string
  location?: string | null
  note?: string | null
  remindMinutes?: number
}

interface LifeosApi {
  tasks: {
    list(date: string): Promise<Task[]>
    create(input: TaskInput): Promise<Task>
    update(id: number, patch: TaskPatch): Promise<Task>
    remove(id: number): Promise<void>
  }
  longTasks: {
    listRange(from: string, to: string): Promise<LongTask[]>
    create(input: LongTaskInput): Promise<LongTask>
    update(id: number, patch: LongTaskPatch): Promise<LongTask>
    setDone(id: number, done: boolean): Promise<LongTask>
    markFromSource(input: MarkFromSourceInput): Promise<LongTask>
    removeBySource(sourceModule: ModuleKey, sourceId: number): Promise<void>
    remove(id: number): Promise<void>
  }
  events: {
    listInRange(from: string, to: string): Promise<Event[]>
    listOccurrences(from: string, to: string): Promise<Occurrence[]>
    create(input: EventInput): Promise<Event>
    update(id: number, patch: EventPatch): Promise<Event>
    remove(id: number): Promise<void>
  }
  interop: {
    syncDates(dates: string[]): Promise<void>
    convertTask(taskId: number, input: ConvertTaskInput): Promise<Event>
  }
  settings: {
    getAll(): Promise<Settings>
    set<K extends SettingsKey>(key: K, value: Settings[K]): Promise<Settings>
  }
  theme: {
    fetchStyle(url: string): Promise<ThemePalette>
  }
  data: {
    export(): Promise<{ canceled: boolean; file?: string }>
    import(): Promise<{ canceled: boolean; ok?: boolean; error?: string }>
  }
  learn: {
    listItems(): Promise<LearnItem[]>
    createItem(input: LearnItemInput): Promise<LearnItem>
    updateItem(id: number, patch: LearnItemPatch): Promise<LearnItem>
    removeItem(id: number): Promise<void>
    setProgress(id: number, doneUnits: number): Promise<LearnItem>
    listNotes(itemId: number): Promise<LearnNote[]>
    createNote(itemId: number, content: string): Promise<LearnNote>
    updateNote(id: number, content: string): Promise<LearnNote>
    removeNote(id: number): Promise<void>
    listSessions(from?: string, to?: string): Promise<LearnSession[]>
    createSession(itemId: number, date: string, minutes: number): Promise<LearnSession>
    removeSession(id: number): Promise<void>
  }
  dev: {
    listProjects(): Promise<Project[]>
    createProject(input: ProjectInput): Promise<Project>
    updateProject(id: number, patch: ProjectPatch): Promise<Project>
    removeProject(id: number): Promise<void>
    /** IPC 传回 [projectId, stats][] 数组，渲染端自行转 Map */
    listProjectStats(): Promise<[number, ProjectStats][]>

    listTasks(projectId: number): Promise<DevTask[]>
    /** 全部项目的任务，供本周计时做 task → project 映射 */
    listAllTasks(): Promise<DevTask[]>
    createTask(input: DevTaskInput): Promise<DevTask>
    updateTask(id: number, patch: DevTaskPatch): Promise<DevTask>
    removeTask(id: number): Promise<void>
    /** 返回该项目最新看板 */
    moveTask(id: number, column: DevColumn, index: number): Promise<DevTask[]>

    listBugs(projectId: number): Promise<Bug[]>
    createBug(input: BugInput): Promise<Bug>
    updateBug(id: number, patch: BugPatch): Promise<Bug>
    removeBug(id: number): Promise<void>

    listSnippets(): Promise<Snippet[]>
    createSnippet(input: SnippetInput): Promise<Snippet>
    updateSnippet(id: number, patch: SnippetPatch): Promise<Snippet>
    removeSnippet(id: number): Promise<void>
    searchSnippets(filter: SnippetFilter): Promise<Snippet[]>

    listNotes(): Promise<TechNote[]>
    createNote(input: TechNoteInput): Promise<TechNote>
    updateNote(id: number, patch: TechNotePatch): Promise<TechNote>
    removeNote(id: number): Promise<void>

    listSessions(taskId?: number): Promise<DevSession[]>
    createSession(taskId: number, startedAt: string, endedAt: string, minutes: number): Promise<DevSession>
    removeSession(id: number): Promise<void>
    minutesByProject(): Promise<[number, number][]>
    minutesByTask(projectId: number): Promise<[number, number][]>
  }
  insp: {
    list(filter?: InspirationFilter): Promise<Inspiration[]>
    get(id: number): Promise<Inspiration | null>
    capture(input: CaptureInput): Promise<Inspiration>
    update(id: number, patch: InspirationPatch): Promise<Inspiration>
    remove(id: number): Promise<void>
    setStarred(id: number, starred: boolean): Promise<Inspiration>
    listTags(): Promise<string[]>
    listBoards(): Promise<InspirationBoard[]>
    createBoard(input: BoardInput): Promise<InspirationBoard>
    updateBoard(id: number, patch: BoardPatch): Promise<InspirationBoard>
    removeBoard(id: number): Promise<void>
    boardStats(): Promise<[number, BoardStat][]>
    /** 主进程读剪贴板图片；没有图片返回 null */
    readClipboardImage(): Promise<{ bytes: Uint8Array; mime: string } | null>
  }
  fit: {
    listPlans(): Promise<WorkoutPlan[]>
    createPlan(input: WorkoutPlanInput): Promise<WorkoutPlan>
    updatePlan(id: number, patch: WorkoutPlanPatch): Promise<WorkoutPlan>
    removePlan(id: number): Promise<void>

    listLogs(from?: string, to?: string): Promise<WorkoutLog[]>
    createLog(input: WorkoutLogInput): Promise<WorkoutLog>
    updateLog(id: number, patch: WorkoutLogPatch): Promise<WorkoutLog>
    removeLog(id: number): Promise<void>

    listMetrics(from?: string, to?: string): Promise<BodyMetric[]>
    upsertMetric(input: BodyMetricInput): Promise<BodyMetric>
    removeMetric(id: number): Promise<void>
  }
  diet: {
    listMeals(from?: string, to?: string): Promise<Meal[]>
    upsertMeal(input: MealInput): Promise<Meal>
    removeMeal(id: number): Promise<void>

    listPlans(from?: string, to?: string): Promise<MealPlan[]>
    upsertMealPlan(input: MealPlanInput): Promise<MealPlan>
    removePlan(id: number): Promise<void>
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window {
    lifeos: LifeosApi
    /** 首屏主题色板（主进程启动时注入，见 src/renderer/src/themeInit.ts） */
    __lifeosTheme?: ThemePalette
  }
}

export const api: LifeosApi = window.lifeos
