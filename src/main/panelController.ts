import { type Display } from 'electron'
import { getPanelWindow, positionOnDisplay } from './panelWindow'

type PanelState = 'hidden' | 'revealed'

/** Slightly longer than the renderer's 220ms slide, as a safety margin. */
const HIDE_FALLBACK_MS = 400

let state: PanelState = 'hidden'
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
}

/**
 * Begin hiding: ask the renderer to slide up. It replies via `onRendererHidden`.
 * Dismissal is fully event-driven — scroll-up (trigger.ts) and Esc (renderer)
 * both route here; there is no auto-dismiss-on-mouse-leave.
 */
export function requestHide(): void {
  const win = getPanelWindow()
  if (!win || state === 'hidden') return
  state = 'hidden'
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
