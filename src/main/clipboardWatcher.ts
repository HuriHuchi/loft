import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { basename } from 'path'
import { clipboard, nativeImage, type NativeImage } from 'electron'
import { clipboardStore } from './store'

/**
 * Electron exposes no clipboard-change event, so we poll. Each tick checks the
 * image FIRST and only falls back to text when there's no image — copying text
 * leaves the image empty and vice versa, so the two branches never fight.
 *
 * Image-first matters because copying an image *file* (e.g. in Finder) puts
 * both the image data AND its file path on the clipboard. Checking the image
 * first lets us capture a single image item and fold the file path into it as a
 * filename, instead of emitting a separate text item for the path.
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
/**
 * After capturing an image, swallow other representations of the same copy that
 * a tool spreads across the next few ticks — e.g. Clop copies the raw image and
 * its file path separately, landing on different ticks. Wide enough to cover
 * that lag, narrow enough not to eat a genuinely new copy.
 */
const IMAGE_BURST_MS = 1500
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|tiff?|webp|heic|heif)$/i

let interval: ReturnType<typeof setInterval> | null = null
let lastTextSig: string | null = null
let lastImageSig: string | null = null
let suppressUntil = 0
let imageBurstUntil = 0

/** sha1 of the raw BGRA bitmap — far cheaper than encoding a PNG every tick. */
function imageSignature(img: NativeImage = clipboard.readImage()): string | null {
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

/** Basename of the file backing the clipboard image (macOS `public.file-url`). */
function clipboardFileName(): string | undefined {
  try {
    const url = clipboard.read('public.file-url')
    if (!url) return undefined
    const path = decodeURIComponent(url.replace(/^file:\/\//, ''))
    return basename(path) || undefined
  } catch {
    return undefined
  }
}

/** If `text` is a path to an existing image file, decode it; otherwise null. */
function imageFromPathText(text: string): NativeImage | null {
  const p = text.trim()
  if (!p.startsWith('/') || p.includes('\n') || !IMAGE_EXT.test(p)) return null
  if (!existsSync(p)) return null
  const img = nativeImage.createFromPath(p)
  return img.isEmpty() ? null : img
}

/** Commit one image item and open a burst window to absorb its other reps. */
function commitImage(img: NativeImage, name: string | undefined, now: number): void {
  clipboardStore.addImage(img, name)
  lastImageSig = imageSignature(img)
  lastTextSig = clipboard.readText() || null
  imageBurstUntil = now + IMAGE_BURST_MS
  onChangeCb?.()
}

function tick(): void {
  const now = Date.now()
  const img = clipboard.readImage()

  if (!img.isEmpty()) {
    const sig = imageSignature(img)
    if (sig !== lastImageSig) {
      // Raw image trailing a just-captured file-path copy → swallow the echo.
      if (now < imageBurstUntil) {
        lastImageSig = sig
        lastTextSig = clipboard.readText() || null
        return
      }
      lastImageSig = sig
      if (now >= suppressUntil) commitImage(img, clipboardFileName(), now)
      else lastTextSig = clipboard.readText() || null
    }
    return
  }

  // No image on the clipboard — check for text.
  const text = clipboard.readText()
  if (text && text !== lastTextSig) {
    if (now < suppressUntil) {
      lastTextSig = text
      return
    }
    const pathImg = imageFromPathText(text)
    if (pathImg) {
      // A path to an image file: capture it as an image (preview + filename),
      // not as text. If it's the echo of an image we just grabbed, skip it.
      lastTextSig = text
      if (now >= imageBurstUntil) commitImage(pathImg, basename(text.trim()), now)
    } else {
      lastTextSig = text
      lastImageSig = null
      clipboardStore.addText(text)
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
  const img = clipboard.readImage()
  lastImageSig = img.isEmpty() ? null : imageSignature(img)
  lastTextSig = clipboard.readText() || null
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
