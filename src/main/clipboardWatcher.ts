import { createHash } from 'crypto'
import { clipboard } from 'electron'
import { clipboardStore } from './store'

/**
 * Electron exposes no clipboard-change event, so we poll. Each tick reads text
 * first and only inspects the image when text is empty — copying text leaves
 * the image empty and vice versa, so the two branches never fight over the same
 * change.
 *
 * The tricky part is the re-copy loop: when the user clicks a history item we
 * call `clipboard.writeText/writeImage`, which is itself a clipboard change the
 * next poll would re-capture. `noteInternalWrite(sig)` sets the baseline
 * signature to exactly what we wrote so the next tick sees "no change", backed
 * by a short suppression window in case a PNG round-trip drifts the bytes.
 */

const DEFAULT_INTERVAL_MS = 500
/** Ignore captures briefly after we write to the clipboard ourselves. */
const SUPPRESS_MS = 600

let interval: ReturnType<typeof setInterval> | null = null
let lastTextSig: string | null = null
let lastImageSig: string | null = null
let suppressUntil = 0

/** sha1 of the raw BGRA bitmap — far cheaper than encoding a PNG every tick. */
function imageSignature(): string | null {
  const img = clipboard.readImage()
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  // getBitmap()을 쓰는 이유: 워처는 클립보드에 이미지가 있는 동안 500ms마다
  // 계속 돈다. toPNG()/toDataURL()은 매 tick마다 이미지를 PNG로 재압축하므로
  // 스크린샷 같은 큰 이미지에서 CPU를 낭비한다. getBitmap()은 이미 디코딩된 raw
  // BGRA 버퍼를 그대로 돌려주므로 인코딩 비용 없이 sha1 해싱만 하면 된다.
  // (Electron .d.ts가 반환 타입을 void로 잘못 선언해 Buffer로 캐스팅한다.)
  const bitmap = img.getBitmap() as unknown as Buffer
  return `${width}x${height}:${createHash('sha1').update(bitmap).digest('hex')}`
}

function tick(): void {
  const text = clipboard.readText()

  if (text) {
    if (text !== lastTextSig) {
      lastTextSig = text
      lastImageSig = null
      if (Date.now() >= suppressUntil) {
        clipboardStore.addText(text)
        onChangeCb?.()
      }
    }
    return
  }

  // No text on the clipboard — check for an image.
  const sig = imageSignature()
  if (sig && sig !== lastImageSig) {
    lastImageSig = sig
    lastTextSig = null
    if (Date.now() >= suppressUntil) {
      clipboardStore.addImage(clipboard.readImage())
      onChangeCb?.()
    }
  }
}

let onChangeCb: (() => void) | null = null

export interface ClipboardWatcherOptions {
  /** Fired after a new item is committed to the store. */
  onChange: () => void
  intervalMs?: number
}

export function startClipboardWatcher(opts: ClipboardWatcherOptions): void {
  if (interval) return
  onChangeCb = opts.onChange
  // Seed the baselines with the current clipboard so we don't capture whatever
  // happened to be there before the app launched.
  lastTextSig = clipboard.readText() || null
  lastImageSig = lastTextSig ? null : imageSignature()
  interval = setInterval(tick, opts.intervalMs ?? DEFAULT_INTERVAL_MS)
}

export function stopClipboardWatcher(): void {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
  onChangeCb = null
}

/**
 * Record a signature we just wrote to the clipboard so the next poll treats it
 * as already-seen. Pass the text for a text write; pass `null` and we'll
 * re-signature the current image for an image write.
 */
export function noteInternalWrite(text: string | null): void {
  suppressUntil = Date.now() + SUPPRESS_MS
  if (text !== null) {
    lastTextSig = text
    lastImageSig = null
  } else {
    lastImageSig = imageSignature()
    lastTextSig = null
  }
}
