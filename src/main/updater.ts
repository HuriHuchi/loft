import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// electron-updater reads the GitHub `publish` config baked into the app at
// package time (see electron-builder.yml), so there is no feed URL to set here.
// It compares the running app.getVersion() against the latest GitHub Release and
// verifies the downloaded artifact's signature before applying it.
export function initAutoUpdate(): void {
  // In dev there is no packaged, signed app to update, and the version is always
  // 0.0.0 — checking would either no-op or error. Only run for real installs.
  if (!app.isPackaged) return

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err)
  })

  // Quiet policy: download a new version in the background, apply it silently on
  // the next quit, and surface at most one native OS notification when the
  // download finishes. No in-app dialog and no forced restart — a menu-bar app
  // is rarely quit deliberately, so the update simply lands the next time the
  // machine reboots or the app is restarted.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  checkForUpdates()
}

/**
 * Trigger an update check on demand (e.g. from the tray menu). Uses the same
 * quiet path as the automatic check: if a newer version exists it downloads in
 * the background and posts a single OS notification when ready; if the app is
 * already current, nothing visible happens. No-ops in dev (nothing to update).
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdatesAndNotify()
}
