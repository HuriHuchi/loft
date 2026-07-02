import { screen, type Display, type Rectangle } from 'electron'
import { getPanelWindow, positionOnDisplay } from './panelWindow'

type PanelState = 'hidden' | 'revealed'

/** Slightly longer than the renderer's 220ms slide, as a safety margin. */
const HIDE_FALLBACK_MS = 400

let state: PanelState = 'hidden'
let dismissWatch: ReturnType<typeof setInterval> | null = null
let hideFallback: ReturnType<typeof setTimeout> | null = null

/** Position the panel on the cursor's display, show it, and slide it down. */
export function reveal(display: Display): void {
  const win = getPanelWindow()
  if (!win) return

  positionOnDisplay(display)
  clearHideFallback() // cancel a pending hide if the user re-opens quickly
  if (state === 'revealed') return
  state = 'revealed'

  // Show without stealing focus from the app the user is working in, then let
  // the renderer slide the content down from translateY(-100%) to 0.
  win.showInactive()
  win.webContents.send('panel:reveal')
  startDismissWatch()
}

/** Begin hiding: ask the renderer to slide up. It replies via `onRendererHidden`. */
export function requestHide(): void {
  const win = getPanelWindow()
  if (!win || state === 'hidden') return
  state = 'hidden'
  stopDismissWatch()
  win.webContents.send('panel:hide')

  // Safety net: never rely solely on the renderer's transitionend. If it doesn't
  // report back (event throttling, interrupted transition, a CSS change that
  // renames the animated property), force-hide anyway so the transparent window
  // can't linger over the top of the screen and swallow clicks.
  clearHideFallback()
  hideFallback = setTimeout(hidePanelWindow, HIDE_FALLBACK_MS)
}

/** Called when the renderer reports its slide-up animation finished. */
export function onRendererHidden(): void {
  hidePanelWindow()
}

function hidePanelWindow(): void {
  clearHideFallback()
  getPanelWindow()?.hide()
}

function clearHideFallback(): void {
  if (hideFallback) {
    clearTimeout(hideFallback)
    hideFallback = null
  }
}

function startDismissWatch(): void {
  stopDismissWatch()
  dismissWatch = setInterval(() => {
    const win = getPanelWindow()
    if (!win) return
    const cursor = screen.getCursorScreenPoint()
    if (shouldDismiss(cursor, win.getBounds())) {
      requestHide()
    }
  }, 120)
}

function stopDismissWatch(): void {
  if (dismissWatch) {
    clearInterval(dismissWatch)
    dismissWatch = null
  }
}

/**
 * Decide whether the revealed panel should auto-dismiss based on the current
 * cursor position relative to the panel's on-screen rectangle.
 *
 * TODO(human): implement the auto-dismiss policy.
 *   - `cursor` and `panel` are in the same global screen coordinates.
 *   - Return true to trigger a slide-up + hide, false to keep the panel open.
 *   Consider: dismiss once the cursor moves below the panel's bottom edge, but
 *   add a hysteresis margin (e.g. a ~40px grace band under `panel.y + panel.height`)
 *   so a cursor hovering right at the seam doesn't flicker open/closed. Scroll-up
 *   and Esc already dismiss via other paths, so this only needs to handle "mouse
 *   wandered away from the panel".
 */
function shouldDismiss(cursor: Electron.Point, panel: Rectangle): boolean {
  return false
}
