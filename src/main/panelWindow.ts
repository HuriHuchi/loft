import { join } from 'path'
import { BrowserWindow, screen, shell, type Display } from 'electron'
import { is } from '@electron-toolkit/utils'

/** Height of the reveal region that slides down from the top of the screen. */
export const PANEL_HEIGHT = 420

let panel: BrowserWindow | null = null

/**
 * Create the panel window. It is frameless, transparent, spans the full width
 * of a display, and floats above the menu bar. It starts hidden — the global
 * scroll trigger shows it (see trigger.ts). We keep ONE window and re-position
 * it onto whichever display the cursor is on at reveal time.
 */
export function createPanelWindow(): BrowserWindow {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

  panel = new BrowserWindow({
    x: cursorDisplay.bounds.x,
    y: cursorDisplay.bounds.y,
    width: cursorDisplay.bounds.width,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // acceptFirstMouse lets a click land immediately without first focusing the window
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Float above the menu bar / Dock and appear on every Space, incl. fullscreen.
  // Level must sit BELOW macOS's drag-session layer (kCGDraggingWindowLevel = 500)
  // or Finder file drops never reach the window (they fall through to the desktop).
  // 'screen-saver' (1000) is above 500 → breaks drops. 'pop-up-menu' (101) receives
  // drops but on recent macOS the Dock floats above 101. So target ~249 via
  // relativeLevel: above the Dock, still under the 500 drag layer.
  panel.setAlwaysOnTop(true, 'pop-up-menu', 148)
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // External links open in the default browser, not inside the panel.
  panel.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    panel.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // 패널은 frameless + showInactive라 F12/메뉴로 DevTools를 열기 어렵다.
    // dev에서는 렌더러 콘솔(console.log 등)을 볼 수 있게 별도 창으로 자동으로 연다.
    panel.webContents.openDevTools({ mode: 'detach' })
  } else {
    panel.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return panel
}

export function getPanelWindow(): BrowserWindow | null {
  return panel
}

/** Snap the panel to the full width of the given display, pinned to its top edge. */
export function positionOnDisplay(display: Display): void {
  if (!panel) return
  panel.setBounds({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: PANEL_HEIGHT
  })
}
