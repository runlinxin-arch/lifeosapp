import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import * as tasks from './db/tasks'
import * as longTasks from './db/longTasks'

export function registerIpc(db: DatabaseSync): void {
  ipcMain.handle('tasks:list', (_e, date: string) => tasks.listTasksByDate(db, date))
  ipcMain.handle('tasks:create', (_e, input: tasks.TaskInput) => tasks.createTask(db, input))
  ipcMain.handle('tasks:update', (_e, id: number, patch: tasks.TaskPatch) => tasks.updateTask(db, id, patch))
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(db, id))
  ipcMain.handle('longTasks:listRange', (_e, from: string, to: string) => longTasks.listRange(db, from, to))
  ipcMain.handle('longTasks:create', (_e, input: longTasks.LongTaskInput) => longTasks.createLongTask(db, input))
  ipcMain.handle('longTasks:delete', (_e, id: number) => longTasks.deleteLongTask(db, id))
}
