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
  }
}

contextBridge.exposeInMainWorld('lifeos', api)
