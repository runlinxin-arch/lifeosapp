import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import type { ModuleKey } from '@shared/types'
import * as tasks from './db/tasks'
import * as longTasks from './db/longTasks'
import * as events from './db/events'
import * as interop from './db/interop'
import { getAllSettings, setSetting, type SettingsKey } from './db/settings'

export function registerIpc(db: DatabaseSync): void {
  ipcMain.handle('tasks:list', (_e, date: string) => {
    // 当日日程发生项先同步成待办行，再返回列表
    interop.syncEventTasks(db, date)
    return tasks.listTasksByDate(db, date)
  })
  ipcMain.handle('tasks:create', (_e, input: tasks.TaskInput) => tasks.createTask(db, input))
  ipcMain.handle('tasks:update', (_e, id: number, patch: tasks.TaskPatch) => tasks.updateTask(db, id, patch))
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(db, id))

  ipcMain.handle('longTasks:listRange', (_e, from: string, to: string) => longTasks.listRange(db, from, to))
  ipcMain.handle('longTasks:create', (_e, input: longTasks.LongTaskInput) => longTasks.createLongTask(db, input))
  ipcMain.handle('longTasks:update', (_e, id: number, patch: longTasks.LongTaskPatch) => longTasks.updateLongTask(db, id, patch))
  ipcMain.handle('longTasks:setDone', (_e, id: number, done: boolean) => longTasks.setLongTaskDone(db, id, done))
  ipcMain.handle('longTasks:markFromSource', (_e, input: longTasks.MarkFromSourceInput) => longTasks.markFromSource(db, input))
  ipcMain.handle('longTasks:removeBySource', (_e, m: ModuleKey, id: number) => longTasks.removeBySource(db, m, id))
  ipcMain.handle('longTasks:delete', (_e, id: number) => longTasks.deleteLongTask(db, id))

  ipcMain.handle('events:listInRange', (_e, from: string, to: string) => events.listEvents(db, from, to))
  ipcMain.handle('events:listOccurrences', (_e, from: string, to: string) => events.listOccurrences(db, from, to))
  ipcMain.handle('events:create', (_e, input: events.EventInput) => events.createEvent(db, input))
  ipcMain.handle('events:update', (_e, id: number, patch: events.EventPatch) => events.updateEvent(db, id, patch))
  ipcMain.handle('events:delete', (_e, id: number) => events.deleteEvent(db, id))

  ipcMain.handle('interop:syncDates', (_e, dates: string[]) => {
    for (const d of dates) interop.syncEventTasks(db, d)
  })
  ipcMain.handle('interop:convertTask', (_e, taskId: number, input: interop.ConvertInput) =>
    interop.convertTaskToEvent(db, taskId, input))

  ipcMain.handle('settings:getAll', () => getAllSettings(db))
  ipcMain.handle('settings:set', (_e, key: SettingsKey, value: unknown) =>
    setSetting(db, key, value as never))
}
