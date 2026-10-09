import { contextBridge, ipcRenderer } from 'electron'

const api = {
  tasks: {
    list: (date: string): Promise<unknown> => ipcRenderer.invoke('tasks:list', date),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('tasks:create', input),
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('tasks:update', id, patch),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('tasks:delete', id)
  },
  longTasks: {
    listRange: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('longTasks:listRange', from, to),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:create', input),
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:update', id, patch),
    setDone: (id: number, done: boolean): Promise<unknown> => ipcRenderer.invoke('longTasks:setDone', id, done),
    markFromSource: (input: unknown): Promise<unknown> => ipcRenderer.invoke('longTasks:markFromSource', input),
    removeBySource: (m: string, id: number): Promise<unknown> => ipcRenderer.invoke('longTasks:removeBySource', m, id),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('longTasks:delete', id)
  },
  events: {
    listInRange: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('events:listInRange', from, to),
    listOccurrences: (from: string, to: string): Promise<unknown> => ipcRenderer.invoke('events:listOccurrences', from, to),
    create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('events:create', input),
    update: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('events:update', id, patch),
    remove: (id: number): Promise<unknown> => ipcRenderer.invoke('events:delete', id)
  },
  interop: {
    syncDates: (dates: string[]): Promise<unknown> => ipcRenderer.invoke('interop:syncDates', dates),
    convertTask: (taskId: number, input: unknown): Promise<unknown> => ipcRenderer.invoke('interop:convertTask', taskId, input)
  },
  settings: {
    getAll: (): Promise<unknown> => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: unknown): Promise<unknown> => ipcRenderer.invoke('settings:set', key, value)
  },
  learn: {
    listItems: (): Promise<unknown> => ipcRenderer.invoke('learn:listItems'),
    createItem: (input: unknown): Promise<unknown> => ipcRenderer.invoke('learn:createItem', input),
    updateItem: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('learn:updateItem', id, patch),
    removeItem: (id: number): Promise<unknown> => ipcRenderer.invoke('learn:deleteItem', id),
    setProgress: (id: number, doneUnits: number): Promise<unknown> => ipcRenderer.invoke('learn:setProgress', id, doneUnits),
    listNotes: (itemId: number): Promise<unknown> => ipcRenderer.invoke('learn:listNotes', itemId),
    createNote: (itemId: number, content: string): Promise<unknown> => ipcRenderer.invoke('learn:createNote', itemId, content),
    updateNote: (id: number, content: string): Promise<unknown> => ipcRenderer.invoke('learn:updateNote', id, content),
    removeNote: (id: number): Promise<unknown> => ipcRenderer.invoke('learn:deleteNote', id),
    listSessions: (from?: string, to?: string): Promise<unknown> => ipcRenderer.invoke('learn:listSessions', from, to),
    createSession: (itemId: number, date: string, minutes: number): Promise<unknown> =>
      ipcRenderer.invoke('learn:createSession', itemId, date, minutes),
    removeSession: (id: number): Promise<unknown> => ipcRenderer.invoke('learn:deleteSession', id)
  },
  dev: {
    listProjects: (): Promise<unknown> => ipcRenderer.invoke('dev:listProjects'),
    createProject: (input: unknown): Promise<unknown> => ipcRenderer.invoke('dev:createProject', input),
    updateProject: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('dev:updateProject', id, patch),
    removeProject: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteProject', id),
    listProjectStats: (): Promise<unknown> => ipcRenderer.invoke('dev:listProjectStats'),

    listTasks: (projectId: number): Promise<unknown> => ipcRenderer.invoke('dev:listTasks', projectId),
    createTask: (input: unknown): Promise<unknown> => ipcRenderer.invoke('dev:createTask', input),
    updateTask: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('dev:updateTask', id, patch),
    removeTask: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteTask', id),
    moveTask: (id: number, column: string, index: number): Promise<unknown> =>
      ipcRenderer.invoke('dev:moveTask', id, column, index),

    listBugs: (projectId: number): Promise<unknown> => ipcRenderer.invoke('dev:listBugs', projectId),
    createBug: (input: unknown): Promise<unknown> => ipcRenderer.invoke('dev:createBug', input),
    updateBug: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('dev:updateBug', id, patch),
    removeBug: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteBug', id),

    listSnippets: (): Promise<unknown> => ipcRenderer.invoke('dev:listSnippets'),
    createSnippet: (input: unknown): Promise<unknown> => ipcRenderer.invoke('dev:createSnippet', input),
    updateSnippet: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('dev:updateSnippet', id, patch),
    removeSnippet: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteSnippet', id),
    searchSnippets: (filter: unknown): Promise<unknown> => ipcRenderer.invoke('dev:searchSnippets', filter),

    listNotes: (): Promise<unknown> => ipcRenderer.invoke('dev:listNotes'),
    createNote: (input: unknown): Promise<unknown> => ipcRenderer.invoke('dev:createNote', input),
    updateNote: (id: number, patch: unknown): Promise<unknown> => ipcRenderer.invoke('dev:updateNote', id, patch),
    removeNote: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteNote', id),

    listSessions: (taskId?: number): Promise<unknown> => ipcRenderer.invoke('dev:listSessions', taskId),
    createSession: (taskId: number, startedAt: string, endedAt: string, minutes: number): Promise<unknown> =>
      ipcRenderer.invoke('dev:createSession', taskId, startedAt, endedAt, minutes),
    removeSession: (id: number): Promise<unknown> => ipcRenderer.invoke('dev:deleteSession', id),
    minutesByProject: (): Promise<unknown> => ipcRenderer.invoke('dev:minutesByProject'),
    minutesByTask: (projectId: number): Promise<unknown> => ipcRenderer.invoke('dev:minutesByTask', projectId)
  }
}

contextBridge.exposeInMainWorld('lifeos', api)
