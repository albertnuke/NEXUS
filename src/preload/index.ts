import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppInfo,
  ApplicationSettings,
  GraphSnapshot,
  MenuCommand,
  NoteContent,
  SearchResult,
  VaultStatus
} from '@shared/types'

/**
 * The only bridge between the sandboxed renderer and the main process.
 * It exposes a small, typed API — no generic `invoke`, no filesystem access.
 */

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  vault: {
    getStatus: (): Promise<VaultStatus> => ipcRenderer.invoke(IPC.getStatus),
    getSnapshot: (): Promise<GraphSnapshot | null> => ipcRenderer.invoke(IPC.getSnapshot),
    select: (): Promise<{ canceled: boolean }> => ipcRenderer.invoke(IPC.selectVault),
    openDemo: (): Promise<boolean> => ipcRenderer.invoke(IPC.openDemo),
    reindex: (): Promise<boolean> => ipcRenderer.invoke(IPC.reindex),
    disconnect: (): Promise<boolean> => ipcRenderer.invoke(IPC.disconnect),
    getNote: (id: string): Promise<NoteContent> => ipcRenderer.invoke(IPC.getNote, id),
    search: (query: string, limit?: number): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.search, query, limit),
    openInObsidian: (id: string, newTab?: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.openInObsidian, id, newTab),
    revealInFinder: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.revealInFinder, id),
    onStatus: (cb: (s: VaultStatus) => void) => subscribe(IPC.statusEvent, cb),
    onSnapshot: (cb: (s: GraphSnapshot) => void) => subscribe(IPC.snapshotEvent, cb)
  },
  settings: {
    get: (): Promise<ApplicationSettings> => ipcRenderer.invoke(IPC.getSettings),
    update: (patch: Partial<ApplicationSettings>): Promise<ApplicationSettings> =>
      ipcRenderer.invoke(IPC.updateSettings, patch),
    onChange: (cb: (s: ApplicationSettings) => void) => subscribe(IPC.settingsEvent, cb)
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.getAppInfo),
    clearCache: (): Promise<boolean> => ipcRenderer.invoke(IPC.clearCache),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke(IPC.openExternal, url),
    onMenu: (cb: (cmd: MenuCommand) => void) => subscribe(IPC.menuEvent, cb),
    onVisibility: (cb: (visible: boolean) => void) => subscribe(IPC.visibilityEvent, cb)
  }
}

export type NexusApi = typeof api

contextBridge.exposeInMainWorld('nexus', api)
