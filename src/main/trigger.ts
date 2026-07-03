import { screen, systemPreferences, type Display } from 'electron'
import { uIOhook, WheelDirection } from 'uiohook-napi'

/** How close to the very top edge (px) the cursor must be to arm the trigger. */
const HOT_ZONE_PX = 2

/**
 * Which wheel `rotation` sign counts as a "scroll down" that reveals the panel.
 * With natural scrolling on, a physical scroll-down reports rotation > 0 here, so
 * we reveal on positive rotation. Flip this one constant if it ever feels inverted.
 * `TRIGGER_DEBUG=1 pnpm dev` logs the rotation value to confirm.
 */
const REVEAL_ON_NEGATIVE_ROTATION = false

export interface TriggerHandlers {
  /** Cursor is pinned to the top edge and the user scrolled in the reveal direction. */
  onRevealIntent: (display: Display) => void
  /**
   * User scrolled in the opposite direction (a dismiss signal). Carries the
   * cursor position so the consumer can decide whether the cursor is actually
   * over the panel before acting.
   */
  onDismissIntent: (point: { x: number; y: number }) => void
}

/**
 * True if the point falls within the macOS menu-bar strip at the top of its
 * display — the gap between the display's full `bounds` and its usable
 * `workArea`. Falls back to the top-edge hot zone on displays without a menu bar
 * (secondary screens report a zero-height gap).
 */
export function isPointInMenuBar(point: { x: number; y: number }): boolean {
  const display = screen.getDisplayNearestPoint(point)
  const menuBarHeight = Math.max(display.workArea.y - display.bounds.y, HOT_ZONE_PX)
  return point.y >= display.bounds.y && point.y < display.bounds.y + menuBarHeight
}

/** True if macOS Accessibility permission is granted (required for global input). */
export function hasAccessibilityPermission(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/** Prompt the user to grant Accessibility permission (opens the system dialog). */
export function promptAccessibilityPermission(): void {
  systemPreferences.isTrustedAccessibilityClient(true)
}

let listenerBound = false
let running = false
let handlers: TriggerHandlers | null = null
let permissionWatch: ReturnType<typeof setTimeout> | null = null

/**
 * Bind the wheel listener (once) and attempt to start the global hook.
 * Returns whether the hook is now running. Safe to call repeatedly — e.g. again
 * after the user grants Accessibility permission, without needing an app restart.
 */
export function startGlobalTrigger(h: TriggerHandlers): boolean {
  handlers = h

  if (!listenerBound) {
    uIOhook.on('wheel', onWheel)
    listenerBound = true
  }

  return tryStart()
}

/** Attempt to start the hook if permission is granted and it isn't already running. */
export function tryStart(): boolean {
  if (running) return true

  // Gate on permission BEFORE calling start(): calling uIOhook.start() without
  // Accessibility access makes libuiohook print a native "Accessibility API is
  // disabled!" error to stderr and throw. Checking first keeps the log clean.
  if (!hasAccessibilityPermission()) return false

  try {
    uIOhook.start()
    running = true
    return true
  } catch (err) {
    console.error('[trigger] failed to start global hook:', err)
    return false
  }
}

export function isRunning(): boolean {
  return running
}

/**
 * Watch for Accessibility permission to be granted out-of-band — e.g. the user
 * flips Loft on in System Settings → Privacy & Security → Accessibility — then
 * start the hook and run `onStarted` once (used to refresh the tray). No-op if
 * the hook is already running or a watch is already in flight, so it's safe to
 * call from both app launch and the tray menu.
 */
export function watchForPermission(onStarted: () => void): void {
  if (running || permissionWatch !== null) return

  // Poll at a fixed 2s cadence for ~2 minutes, then stop. Granting happens out
  // of band (System Settings), so polling is the only option; 2s balances
  // responsiveness against a background app spinning a timer. We cap the window
  // rather than watch forever — if the user never grants, the tray still shows
  // "Grant Accessibility permission…" and clicking it re-arms this watch.
  const INTERVAL_MS = 2000
  const MAX_ATTEMPTS = 60

  let attempts = 0
  const check = (): void => {
    permissionWatch = null
    if (tryStart()) {
      onStarted()
      return
    }
    if (++attempts >= MAX_ATTEMPTS) return
    permissionWatch = setTimeout(check, INTERVAL_MS)
  }

  check()
}

export function stopGlobalTrigger(): void {
  if (permissionWatch !== null) {
    clearTimeout(permissionWatch)
    permissionWatch = null
  }
  if (!running) return
  running = false
  uIOhook.stop()
}

function onWheel(e: { direction: number; rotation: number }): void {
  if (!handlers) return
  if (e.direction !== WheelDirection.VERTICAL) return

  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const atTopEdge = point.y <= display.bounds.y + HOT_ZONE_PX

  if (process.env['TRIGGER_DEBUG']) {
    console.log('[wheel]', { y: point.y, top: display.bounds.y, atTopEdge, rotation: e.rotation })
  }

  const scrollingDown = REVEAL_ON_NEGATIVE_ROTATION ? e.rotation < 0 : e.rotation > 0

  if (atTopEdge && scrollingDown) {
    handlers.onRevealIntent(display)
  } else if (!scrollingDown) {
    handlers.onDismissIntent(point)
  }
}
