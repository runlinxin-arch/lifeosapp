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
