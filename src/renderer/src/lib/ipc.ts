import type { Task, LongTask, Priority } from '@shared/types'

export interface TaskPatch { title?: string; done?: boolean; priority?: Priority }
export interface TaskInput { title: string; priority?: Priority; date: string }
export interface LongTaskInput { title: string; startDate: string; endDate: string; color?: string }

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
    remove(id: number): Promise<void>
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window { lifeos: LifeosApi }
}

export const api: LifeosApi = window.lifeos
