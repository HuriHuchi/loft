import { writeFileSync } from 'fs'
import { app, ipcMain, screen } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { createPanelWindow, getPanelWindow } from './panelWindow'
import { createTray, refreshMenu } from './tray'
import { reveal, requestHide, onRendererHidden } from './panelController'
import {
  startGlobalTrigger,
  stopGlobalTrigger,
  hasAccessibilityPermission,
  promptAccessibilityPermission
} from './trigger'
import { registerPaneIpc, pushClipboard } from './paneIpc'
import { startClipboardWatcher, stopClipboardWatcher } from './clipboardWatcher'
import { clipboardStore, filesStore } from './store'

// Menu-bar app: no dock icon.
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.unclutter.poc')

  createPanelWindow()
  createTray()

  // renderer -> main lifecycle signals
  ipcMain.on('panel:hidden', onRendererHidden) // slide-up animation finished
  ipcMain.on('panel:dismiss', requestHide) // Esc / click-outside from the renderer

  // Pane data: clipboard history + dropped files (persisted under userData).
  registerPaneIpc()
  startClipboardWatcher({ onChange: pushClipboard })

  if (!hasAccessibilityPermission()) {
    // Trigger the system prompt on first launch; the tray menu also links to it.
    promptAccessibilityPermission()
  }

  startGlobalTrigger({
    onRevealIntent: (display) => reveal(display),
    onDismissIntent: () => requestHide()
  })

  refreshMenu()

  // DEV-ONLY: reveal without a physical scroll so the slide can be exercised and
  // screenshotted in environments where Accessibility permission can't be granted.
  // Set AUTO_REVEAL=1 (optionally CAPTURE_PATH=/abs/file.png) to use it.
  if (process.env.AUTO_REVEAL) {
    setTimeout(() => {
      reveal(screen.getPrimaryDisplay())
      const capturePath = process.env.CAPTURE_PATH
      if (capturePath) {
        setTimeout(async () => {
          const img = await getPanelWindow()?.webContents.capturePage()
          if (img) writeFileSync(capturePath, img.toPNG())
          console.log('[auto-reveal] captured panel to', capturePath)
        }, 700)
      }
    }, 1500)
  }
})

// Keep running as a menu-bar app even with no visible windows. Registering this
// handler (and not calling app.quit) overrides Electron's default quit-on-close.
app.on('window-all-closed', () => {})

app.on('will-quit', () => {
  stopGlobalTrigger()
  stopClipboardWatcher()
  // Flush any debounced writes so nothing is lost on quit.
  clipboardStore.flush()
  filesStore.flush()
})
