import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ClipItem, FileItem } from '../shared/types'

/** API exposed to the renderer for the slide-panel lifecycle. */
const panelApi = {
  /** main -> renderer: slide the content down into view. */
  onReveal: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('panel:reveal', listener)
    return () => ipcRenderer.removeListener('panel:reveal', listener)
  },
  /** main -> renderer: slide the content back up. */
  onHide: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('panel:hide', listener)
    return () => ipcRenderer.removeListener('panel:hide', listener)
  },
  /** renderer -> main: the slide-up animation finished; safe to hide the window. */
  notifyHidden: () => ipcRenderer.send('panel:hidden'),
  /** renderer -> main: user asked to dismiss (Esc / click outside). */
  dismiss: () => ipcRenderer.send('panel:dismiss'),

  /** Clipboard history (captured + persisted in the main process). */
  clipboard: {
    list: (): Promise<ClipItem[]> => ipcRenderer.invoke('clipboard:list'),
    copy: (id: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', id),
    clear: (): Promise<void> => ipcRenderer.invoke('clipboard:clear'),
    /** main -> renderer: history changed. Returns an unsubscribe fn. */
    onChanged: (cb: (items: ClipItem[]) => void): (() => void) => {
      const listener = (_e: unknown, items: ClipItem[]): void => cb(items)
      ipcRenderer.on('clipboard:changed', listener)
      return () => {
        ipcRenderer.removeListener('clipboard:changed', listener)
      }
    }
  },

  /** Dropped files, shown desktop-style with their real macOS icon. */
  files: {
    list: (): Promise<FileItem[]> => ipcRenderer.invoke('files:list'),
    add: (paths: string[]): Promise<FileItem[]> => ipcRenderer.invoke('files:add', paths),
    remove: (path: string): Promise<FileItem[]> => ipcRenderer.invoke('files:remove', path),
    open: (path: string): Promise<void> => ipcRenderer.invoke('files:open', path),
    /**
     * Resolve a dropped File to its absolute path. Runs in the preload because
     * `File.path` is gone under contextIsolation; returns '' for non-file drags.
     */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },

  /** Persisted column layout: relative flex-grow weights for the three panes. */
  panes: {
    getWidths: (): Promise<number[]> => ipcRenderer.invoke('panes:getWidths'),
    /** Fire-and-forget; the renderer owns the live value while dragging. */
    setWidths: (weights: number[]): void => ipcRenderer.send('panes:setWidths', weights)
  }
}

contextBridge.exposeInMainWorld('panel', panelApi)

export type PanelApi = typeof panelApi
