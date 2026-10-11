export type Priority = 'low' | 'mid' | 'high'

export type ModuleKey =
  | 'schedule' | 'learning' | 'dev' | 'inspiration'
  | 'fitness' | 'diet'

/**
 * 待办的来源：业务模块，或由日程事件自动汇入（'event'）。
 * 与 LongTask 的 source_module 区分开——长期任务只会来自业务模块，
 * 而待办多出一种"日程汇入"的来源。
 */
export type TaskSource = ModuleKey | 'event'

export interface Task {
  id: number
  title: string
  done: boolean
  priority: Priority
  done_at: string | null
  date: string
  source_module: TaskSource | null
  source_id: number | null
  created_at: string
  updated_at: string
}

export interface LongTask {
  id: number
  title: string
  start_date: string
  end_date: string
  color: string
  done: boolean
  source_module: ModuleKey | null
  source_id: number | null
  created_at: string
  updated_at: string
}

export const MODULE_COLORS: Record<ModuleKey, string> = {
  schedule: '#7c8cff',
  learning: '#4ade80',
  dev: '#3498db',
  inspiration: '#e879c9',
  fitness: '#e74c3c',
  diet: '#f39c12'
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly'

export type LongTaskPatch = Partial<Pick<LongTask, 'title' | 'start_date' | 'end_date' | 'done' | 'color'>>

/** 模块事项（学习项 / 开发项目等）标记为长期任务的入参 */
export interface MarkFromSourceInput {
  title: string
  startDate: string
  endDate: string
  sourceModule: ModuleKey
  sourceId: number
}
export interface Event {
  id: number
  title: string
  start_at: string          // 'YYYY-MM-DD HH:MM'
  end_at: string            // 'YYYY-MM-DD HH:MM'
  all_day: boolean
  location: string | null
  note: string | null
  repeat_type: RepeatType
  repeat_interval: number
  repeat_until: string | null   // 'YYYY-MM-DD'
  remind_minutes: number
  created_at: string
  updated_at: string
}

export interface EventInput {
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  location?: string | null
  note?: string | null
  repeatType?: RepeatType
  repeatInterval?: number
  repeatUntil?: string | null
  remindMinutes?: number
}

export type EventPatch = Partial<EventInput>

/** 事件在某个具体日期的发生项（重复事件展开后的结果） */
export interface Occurrence {
  eventId: number
  title: string
  date: string          // 'YYYY-MM-DD'
  startAt: string       // 'YYYY-MM-DD HH:MM'
  endAt: string
  allDay: boolean
  location: string | null
  note: string | null
  remindMinutes: number
}

// ---------- M3-1 自我学习 ----------

export type LearnType = 'book' | 'course' | 'skill'
export type LearnStatus = 'not_started' | 'learning' | 'done'

export interface LearnItem {
  id: number
  title: string
  type: LearnType
  status: LearnStatus
  total_units: number
  done_units: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface LearnNote {
  id: number
  item_id: number
  content: string
  created_at: string
  updated_at: string
}

export interface LearnSession {
  id: number
  item_id: number
  date: string
  minutes: number
  created_at: string
}

export interface LearnItemInput {
  title: string
  type?: LearnType
  status?: LearnStatus
  totalUnits?: number
  doneUnits?: number
  startDate?: string | null
  endDate?: string | null
}

export type LearnItemPatch = Partial<LearnItemInput>

// ---------- M3-2 开发 ----------

export type ProjectStatus = 'planned' | 'in_progress' | 'paused' | 'done'
export type DevColumn = 'todo' | 'doing' | 'done'
export type BugStatus = 'open' | 'fixing' | 'fixed'

export interface Project {
  id: number
  name: string
  status: ProjectStatus
  description: string
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface DevTask {
  id: number
  project_id: number
  title: string
  column_name: DevColumn
  position: number
  priority: Priority
  start_date: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface Bug {
  id: number
  project_id: number
  title: string
  description: string
  priority: Priority
  status: BugStatus
  created_at: string
  updated_at: string
}

export interface Snippet {
  id: number
  title: string
  code: string
  language: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface TechNote {
  id: number
  title: string
  content: string
  project_id: number | null
  created_at: string
  updated_at: string
}

export interface DevSession {
  id: number
  task_id: number
  started_at: string
  ended_at: string
  minutes: number
  created_at: string
}

export interface ProjectInput {
  name: string
  status?: ProjectStatus
  description?: string
  startDate?: string | null
  endDate?: string | null
}
export type ProjectPatch = Partial<ProjectInput>

export interface DevTaskInput {
  projectId: number
  title: string
  column?: DevColumn
  priority?: Priority
  startDate?: string | null
  dueDate?: string | null
}
export type DevTaskPatch = Partial<Omit<DevTaskInput, 'projectId'>>

export interface BugInput {
  projectId: number
  title: string
  description?: string
  priority?: Priority
  status?: BugStatus
}
export type BugPatch = Partial<Omit<BugInput, 'projectId'>>

export interface SnippetInput {
  title: string
  code?: string
  language?: string
  tags?: string[]
}
export type SnippetPatch = Partial<SnippetInput>

export interface TechNoteInput {
  title: string
  content?: string
  projectId?: number | null
}
export type TechNotePatch = Partial<TechNoteInput>

// ---------- M3-3 设计灵感 ----------

export type CaptureKind = 'image' | 'text' | 'link'

export interface InspirationBoard {
  id: number
  name: string
  created_at: string
  updated_at: string
}

export interface Inspiration {
  id: number
  board_id: number | null
  text: string
  /** 图片文件名（仅文件名，不含目录）；由主进程生成，渲染进程不得提供 */
  image_path: string | null
  source_url: string | null
  starred: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

export interface InspirationInput {
  text?: string
  boardId?: number | null
  sourceUrl?: string | null
  starred?: boolean
  tags?: string[]
  /** 仅供主进程在保存图片后内部使用 */
  imagePath?: string | null
}
export type InspirationPatch = Partial<InspirationInput>

export interface BoardInput { name: string }
export type BoardPatch = Partial<BoardInput>

/** 三合一捕获入参：图片以字节传输，渲染进程不给路径 */
export interface CaptureInput {
  kind: CaptureKind
  text?: string
  sourceUrl?: string
  boardId?: number | null
  tags?: string[]
  imageBytes?: Uint8Array
  imageMime?: string
}

// ---------- M4-1 健身 ----------

/** 单个动作记录 */
export interface WorkoutItem {
  name: string
  /** 重量（kg），允许 0（自重动作） */
  weight: number
  /** 组数，≥1 整数 */
  sets: number
  /** 每组次数，≥1 整数 */
  reps: number
}

export interface WorkoutPlan {
  id: number
  name: string
  /** ISO 星期（"1"–"7"）→ 当天练什么 */
  schedule: Record<string, string>
  created_at: string
  updated_at: string
}

export interface WorkoutLog {
  id: number
  plan_id: number | null
  date: string
  content: WorkoutItem[]
  created_at: string
  updated_at: string
}

export interface BodyMetric {
  id: number
  date: string
  weight: number
  body_fat: number | null
  created_at: string
  updated_at: string
}

export interface WorkoutPlanInput {
  name: string
  schedule?: Record<string, string>
}
export type WorkoutPlanPatch = Partial<WorkoutPlanInput>

export interface WorkoutLogInput {
  date: string
  planId?: number | null
  content?: WorkoutItem[]
}
export type WorkoutLogPatch = Partial<Omit<WorkoutLogInput, 'date'>>

export interface BodyMetricInput {
  date: string
  weight: number
  bodyFat?: number | null
}

// ---------- M4-2 饮食 ----------

/** 餐次：早 / 午 / 晚 / 加餐 */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** 单个食物条目 */
export interface MealItem {
  name: string
  /** 千卡，≥0 */
  calories: number
  /** 蛋白质（g），≥0 */
  protein: number
  /** 碳水（g），≥0 */
  carbs: number
  /** 脂肪（g），≥0 */
  fat: number
}

/** 四项营养合计 */
export interface Nutrition {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Meal {
  id: number
  date: string
  type: MealType
  items: MealItem[]
  created_at: string
  updated_at: string
}

export interface MealInput {
  date: string
  type: MealType
  items?: MealItem[]
}

export interface MealPlan {
  id: number
  date: string
  type: MealType
  content: string
  created_at: string
  updated_at: string
}

export interface MealPlanInput {
  date: string
  type: MealType
  content: string
}
