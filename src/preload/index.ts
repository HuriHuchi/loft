import { contextBridge, ipcRenderer } from 'electron'

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
  dismiss: () => ipcRenderer.send('panel:dismiss')
}

contextBridge.exposeInMainWorld('panel', panelApi)

export type PanelApi = typeof panelApi
