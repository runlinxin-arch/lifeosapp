export type Priority = 'low' | 'mid' | 'high'

export type ModuleKey =
  | 'schedule' | 'learning' | 'dev' | 'inspiration'
  | 'fitness' | 'diet' | 'entertainment'

export interface Task {
  id: number
  title: string
  done: boolean
  priority: Priority
  done_at: string | null
  date: string
  source_module: ModuleKey | null
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
  diet: '#f39c12',
  entertainment: '#a06ee1'
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly'

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
