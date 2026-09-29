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
  }
}

contextBridge.exposeInMainWorld('lifeos', api)
