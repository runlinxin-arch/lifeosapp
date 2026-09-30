import type {
  Event, EventInput, EventPatch, LongTask, LongTaskPatch, MarkFromSourceInput,
  ModuleKey, Occurrence, Priority, Task
} from '@shared/types'
import type { Settings, SettingsKey } from '@shared/settings'

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
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window { lifeos: LifeosApi }
}

export const api: LifeosApi = window.lifeos
