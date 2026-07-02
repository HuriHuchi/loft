import { clipboard, ipcMain, nativeImage, shell } from 'electron'
import { getPanelWindow } from './panelWindow'
import { clipboardStore, filesStore, settingsStore } from './store'
import { noteInternalWrite } from './clipboardWatcher'

/** Push the current clipboard history to the renderer. */
function pushClipboard(): void {
  getPanelWindow()?.webContents.send('clipboard:changed', clipboardStore.list())
}

/**
 * Register the Clipboard and Files IPC handlers. Clipboard changes originate
 * outside the app, so those get a push channel (`clipboard:changed`); file
 * mutations are always renderer-initiated, so those handlers just return the
 * fresh list.
 */
export function registerPaneIpc(): void {
  ipcMain.handle('clipboard:list', () => clipboardStore.list())

  ipcMain.handle('clipboard:copy', (_e, id: string) => {
    const target = clipboardStore.writeTarget(id)
    if (!target) return
    if (target.kind === 'text') {
      clipboard.writeText(target.text)
      noteInternalWrite(target.text)
    } else {
      clipboard.writeImage(nativeImage.createFromPath(target.file))
      noteInternalWrite(null)
    }
  })

  ipcMain.handle('clipboard:remove', (_e, id: string) => {
    clipboardStore.remove(id)
    pushClipboard()
  })

  ipcMain.handle('clipboard:clear', () => {
    clipboardStore.clear()
    pushClipboard()
  })

  ipcMain.handle('files:list', () => filesStore.list())
  ipcMain.handle('files:add', (_e, paths: string[]) => filesStore.add(paths))
  ipcMain.handle('files:remove', (_e, path: string) => filesStore.remove(path))
  ipcMain.handle('files:open', (_e, path: string) => {
    shell.openPath(path)
  })

  // Column widths. `get` is a one-shot invoke on mount; `set` is fire-and-forget
  // (the renderer owns the live value while dragging and only pushes the result).
  ipcMain.handle('panes:getWidths', () => settingsStore.paneWeights())
  ipcMain.on('panes:setWidths', (_e, weights: number[]) => settingsStore.setPaneWeights(weights))
}

export { pushClipboard }
