import { app, Menu, nativeImage, Tray } from 'electron'
import {
  hasAccessibilityPermission,
  promptAccessibilityPermission,
  tryStart,
  isRunning
} from './trigger'
import { checkForUpdates } from './updater'

// 16x16 template chevron, embedded so there's no asset-path resolution to worry
// about between dev and packaged builds. macOS recolors template images for light/dark.
const ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGAXo4D+lav4TUEBIHq8iojTjUkySZnRNZGmmyGaquQA9DEYBDgAAPb8Z562u3LsAAAAASUVORK5CYII='

let tray: Tray | null = null

export function createTray(): Tray {
  const icon = nativeImage.createFromBuffer(Buffer.from(ICON_BASE64, 'base64'))
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Loft')
  refreshMenu()
  return tray
}

/** Rebuild the menu so the permission item reflects the current grant state. */
export function refreshMenu(): void {
  if (!tray) return
  const granted = hasAccessibilityPermission()
  const active = isRunning()

  const menu = Menu.buildFromTemplate([
    { label: 'Loft', enabled: false },
    { type: 'separator' },
    {
      label: active
        ? 'Scroll trigger: active ✓'
        : granted
          ? 'Scroll trigger: not started'
          : 'Grant Accessibility permission…',
      enabled: !active,
      click: () => {
        if (!granted) promptAccessibilityPermission()
        // Once the user flips the toggle in System Settings, start the hook
        // in-place (no app restart needed).
        pollUntilGranted()
      }
    },
    { type: 'separator' },
    // Manual, quiet update check: only surfaces an OS notification if an update
    // is found and downloaded (disabled in dev where there's nothing to update).
    {
      label: 'Check for Updates Now',
      enabled: app.isPackaged,
      click: () => checkForUpdates()
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

/**
 * Poll for the Accessibility grant for a short window; the moment it flips on,
 * start the global hook and refresh the menu. Stops early once running.
 */
function pollUntilGranted(attempts = 20): void {
  if (isRunning()) return
  if (hasAccessibilityPermission()) {
    tryStart()
    refreshMenu()
    return
  }
  if (attempts <= 0) return
  setTimeout(() => pollUntilGranted(attempts - 1), 1000)
}
