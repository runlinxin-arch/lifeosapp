import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import type { ModuleKey } from '@shared/types'
import * as tasks from './db/tasks'
import * as longTasks from './db/longTasks'
import * as events from './db/events'
import * as interop from './db/interop'
import * as learn from './db/learn'
import * as dev from './db/dev'
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

  // ---------- M3-1 自我学习 ----------
  ipcMain.handle('learn:listItems', () => learn.listLearnItems(db))
  ipcMain.handle('learn:createItem', (_e, input: learn.LearnItemInput) => learn.createLearnItem(db, input))
  ipcMain.handle('learn:updateItem', (_e, id: number, patch: learn.LearnItemPatch) =>
    learn.updateLearnItem(db, id, patch))
  ipcMain.handle('learn:deleteItem', (_e, id: number) => learn.deleteLearnItem(db, id))
  ipcMain.handle('learn:setProgress', (_e, id: number, doneUnits: number) =>
    learn.setLearnProgress(db, id, doneUnits))
  ipcMain.handle('learn:listNotes', (_e, itemId: number) => learn.listNotes(db, itemId))
  ipcMain.handle('learn:createNote', (_e, itemId: number, content: string) =>
    learn.createNote(db, itemId, content))
  ipcMain.handle('learn:updateNote', (_e, id: number, content: string) => learn.updateNote(db, id, content))
  ipcMain.handle('learn:deleteNote', (_e, id: number) => learn.deleteNote(db, id))
  ipcMain.handle('learn:listSessions', (_e, from?: string, to?: string) => learn.listSessions(db, from, to))
  ipcMain.handle('learn:createSession', (_e, itemId: number, date: string, minutes: number) =>
    learn.createSession(db, itemId, date, minutes))
  ipcMain.handle('learn:deleteSession', (_e, id: number) => learn.deleteSession(db, id))

  // ---------- M3-2 开发 ----------
  // Map 经 IPC 统一转成 [key, value][] 数组，渲染端再转回 Map（contextBridge 对 Map 支持不可靠）
  ipcMain.handle('dev:listProjects', () => dev.listProjects(db))
  ipcMain.handle('dev:createProject', (_e, input: dev.ProjectInput) => dev.createProject(db, input))
  ipcMain.handle('dev:updateProject', (_e, id: number, patch: dev.ProjectPatch) =>
    dev.updateProject(db, id, patch))
  ipcMain.handle('dev:deleteProject', (_e, id: number) => dev.deleteProject(db, id))
  ipcMain.handle('dev:listProjectStats', () => [...dev.listProjectStats(db).entries()])

  ipcMain.handle('dev:listTasks', (_e, projectId: number) => dev.listDevTasks(db, projectId))
  ipcMain.handle('dev:createTask', (_e, input: dev.DevTaskInput) => dev.createDevTask(db, input))
  ipcMain.handle('dev:updateTask', (_e, id: number, patch: dev.DevTaskPatch) => dev.updateDevTask(db, id, patch))
  ipcMain.handle('dev:deleteTask', (_e, id: number) => dev.deleteDevTask(db, id))
  ipcMain.handle('dev:moveTask', (_e, id: number, column: dev.DevColumn, index: number) =>
    dev.moveDevTask(db, id, column, index))

  ipcMain.handle('dev:listBugs', (_e, projectId: number) => dev.listBugs(db, projectId))
  ipcMain.handle('dev:createBug', (_e, input: dev.BugInput) => dev.createBug(db, input))
  ipcMain.handle('dev:updateBug', (_e, id: number, patch: dev.BugPatch) => dev.updateBug(db, id, patch))
  ipcMain.handle('dev:deleteBug', (_e, id: number) => dev.deleteBug(db, id))

  ipcMain.handle('dev:listSnippets', () => dev.listSnippets(db))
  ipcMain.handle('dev:createSnippet', (_e, input: dev.SnippetInput) => dev.createSnippet(db, input))
  ipcMain.handle('dev:updateSnippet', (_e, id: number, patch: dev.SnippetPatch) =>
    dev.updateSnippet(db, id, patch))
  ipcMain.handle('dev:deleteSnippet', (_e, id: number) => dev.deleteSnippet(db, id))
  ipcMain.handle('dev:searchSnippets', (_e, filter: dev.SnippetFilter) => dev.searchSnippets(db, filter))

  ipcMain.handle('dev:listNotes', () => dev.listTechNotes(db))
  ipcMain.handle('dev:createNote', (_e, input: dev.TechNoteInput) => dev.createTechNote(db, input))
  ipcMain.handle('dev:updateNote', (_e, id: number, patch: dev.TechNotePatch) => dev.updateTechNote(db, id, patch))
  ipcMain.handle('dev:deleteNote', (_e, id: number) => dev.deleteTechNote(db, id))

  ipcMain.handle('dev:listSessions', (_e, taskId?: number) => dev.listDevSessions(db, taskId))
  ipcMain.handle('dev:createSession', (_e, taskId: number, startedAt: string, endedAt: string, minutes: number) =>
    dev.createDevSession(db, taskId, startedAt, endedAt, minutes))
  ipcMain.handle('dev:deleteSession', (_e, id: number) => dev.deleteDevSession(db, id))
  ipcMain.handle('dev:minutesByProject', () => [...dev.minutesByProject(db).entries()])
  ipcMain.handle('dev:minutesByTask', (_e, projectId: number) => [...dev.minutesByTask(db, projectId).entries()])
}
