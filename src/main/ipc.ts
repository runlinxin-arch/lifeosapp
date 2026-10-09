import { ipcMain, clipboard } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import type { ModuleKey } from '@shared/types'
import * as tasks from './db/tasks'
import * as longTasks from './db/longTasks'
import * as events from './db/events'
import * as interop from './db/interop'
import * as learn from './db/learn'
import * as dev from './db/dev'
import * as insp from './db/inspiration'
import * as fit from './db/fitness'
import * as diet from './db/diet'
import { capture } from './capture'
import { readClipboardImage } from './clipboardImage'
import { deleteImageFile, saveImageFile } from './images'
import type { CaptureInput } from '@shared/types'
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
  ipcMain.handle('dev:listAllTasks', () => dev.listAllDevTasks(db))
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

  // ---------- M3-3 设计灵感 ----------
  ipcMain.handle('insp:list', (_e, filter?: insp.InspirationFilter) => insp.listInspirations(db, filter))
  ipcMain.handle('insp:get', (_e, id: number) => insp.getInspiration(db, id))
  ipcMain.handle('insp:capture', (_e, input: CaptureInput) =>
    capture(db, input, { save: saveImageFile, remove: deleteImageFile }))
  ipcMain.handle('insp:update', (_e, id: number, patch: insp.InspirationPatch) =>
    insp.updateInspiration(db, id, patch))
  ipcMain.handle('insp:delete', (_e, id: number) => {
    // 先删记录（事务），提交成功后再删文件：避免"文件没了但记录还在"
    const imageName = insp.deleteInspiration(db, id)
    deleteImageFile(imageName)
  })
  ipcMain.handle('insp:setStarred', (_e, id: number, starred: boolean) => insp.setStarred(db, id, starred))
  ipcMain.handle('insp:listTags', () => insp.listTags(db))
  ipcMain.handle('insp:listBoards', () => insp.listBoards(db))
  ipcMain.handle('insp:createBoard', (_e, input: insp.BoardInput) => insp.createBoard(db, input))
  ipcMain.handle('insp:updateBoard', (_e, id: number, patch: insp.BoardPatch) => insp.updateBoard(db, id, patch))
  ipcMain.handle('insp:deleteBoard', (_e, id: number) => insp.deleteBoard(db, id))
  ipcMain.handle('insp:boardStats', () => [...insp.boardStats(db).entries()])
  // 渲染进程读剪贴板需要授权且依赖焦点；改由主进程读，稳定且无需授权
  ipcMain.handle('insp:readClipboardImage', () => readClipboardImage(clipboard))

  // ---------- M4-1 健身 ----------
  ipcMain.handle('fit:listPlans', () => fit.listPlans(db))
  ipcMain.handle('fit:createPlan', (_e, input: fit.WorkoutPlanInput) => fit.createPlan(db, input))
  ipcMain.handle('fit:updatePlan', (_e, id: number, patch: fit.WorkoutPlanPatch) => fit.updatePlan(db, id, patch))
  ipcMain.handle('fit:deletePlan', (_e, id: number) => fit.deletePlan(db, id))

  ipcMain.handle('fit:listLogs', (_e, from?: string, to?: string) => fit.listLogs(db, from, to))
  ipcMain.handle('fit:createLog', (_e, input: fit.WorkoutLogInput) => fit.createLog(db, input))
  ipcMain.handle('fit:updateLog', (_e, id: number, patch: fit.WorkoutLogPatch) => fit.updateLog(db, id, patch))
  ipcMain.handle('fit:deleteLog', (_e, id: number) => fit.deleteLog(db, id))

  ipcMain.handle('fit:listMetrics', (_e, from?: string, to?: string) => fit.listMetrics(db, from, to))
  ipcMain.handle('fit:upsertMetric', (_e, input: fit.BodyMetricInput) => fit.upsertMetric(db, input))
  ipcMain.handle('fit:deleteMetric', (_e, id: number) => fit.deleteMetric(db, id))
  ipcMain.handle('fit:latestMetric', () => fit.latestBodyMetric(db))

  // ---------- M4-2 饮食 ----------
  ipcMain.handle('diet:listMeals', (_e, from?: string, to?: string) => diet.listMeals(db, from, to))
  ipcMain.handle('diet:getMeal', (_e, date: string, type: diet.MealType) => diet.getMeal(db, date, type))
  ipcMain.handle('diet:upsertMeal', (_e, input: diet.MealInput) => diet.upsertMeal(db, input))
  ipcMain.handle('diet:deleteMeal', (_e, id: number) => diet.deleteMeal(db, id))

  ipcMain.handle('diet:listPlans', (_e, from?: string, to?: string) => diet.listPlans(db, from, to))
  ipcMain.handle('diet:getPlan', (_e, date: string, type: diet.MealType) => diet.getPlan(db, date, type))
  ipcMain.handle('diet:upsertMealPlan', (_e, input: diet.MealPlanInput) => diet.upsertMealPlan(db, input))
  ipcMain.handle('diet:deletePlan', (_e, id: number) => diet.deletePlan(db, id))
}
