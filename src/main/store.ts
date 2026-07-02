import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join } from 'path'
import { app, type NativeImage } from 'electron'
import type { ClipItem, FileItem } from '../shared/types'

/**
 * A tiny JSON file persisted under the app's userData dir. Writes are debounced
 * so a burst of updates (e.g. a fast clipboard poll) collapses into one disk
 * write; `flush()` forces a synchronous write and must be called on quit so a
 * pending debounced write is never lost.
 */
class JsonStore<T> {
  private readonly file: string
  private value: T
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(filename: string, defaultValue: T) {
    this.file = join(app.getPath('userData'), filename)
    this.value = defaultValue
    try {
      if (existsSync(this.file)) {
        this.value = JSON.parse(readFileSync(this.file, 'utf-8')) as T
      }
    } catch {
      // Corrupt/unreadable file: fall back to the default rather than crash.
      this.value = defaultValue
    }
  }

  get(): T {
    return this.value
  }

  set(next: T): void {
    this.value = next
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  update(fn: (cur: T) => T): void {
    this.set(fn(this.value))
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.value))
  }
}

// ─── Clipboard store ────────────────────────────────────────────────────────

/** On-disk shapes. Images store a PNG path, never the (large) data URL. */
type StoredTextClip = { id: string; type: 'text'; createdAt: number; text: string }
type StoredImageClip = {
  id: string
  type: 'image'
  createdAt: number
  file: string
  width: number
  height: number
}
type StoredClipItem = StoredTextClip | StoredImageClip

const MAX_CLIP_ITEMS = 100

function clipboardImagesDir(): string {
  return join(app.getPath('userData'), 'clipboard-images')
}

const clipStore = new JsonStore<StoredClipItem[]>('clipboard.json', [])
/** id -> data URL. Avoids re-reading PNGs from disk on every `list()`. */
const imageDataUrlCache = new Map<string, string>()

function deleteImageFile(item: StoredImageClip): void {
  imageDataUrlCache.delete(item.id)
  try {
    rmSync(item.file, { force: true })
  } catch {
    // best-effort cleanup
  }
}

/** Prepend the new item, trim past the cap (removing orphaned PNGs), persist. */
function commitClip(item: StoredClipItem): void {
  const next = [item, ...clipStore.get()]
  const kept = next.slice(0, MAX_CLIP_ITEMS)
  for (const dropped of next.slice(MAX_CLIP_ITEMS)) {
    if (dropped.type === 'image') deleteImageFile(dropped)
  }
  clipStore.set(kept)
}

export const clipboardStore = {
  /** True when the newest entry is the same text — lets the watcher skip repeats. */
  isNewestText(text: string): boolean {
    const newest = clipStore.get()[0]
    return newest?.type === 'text' && newest.text === text
  },

  addText(text: string): void {
    if (this.isNewestText(text)) return
    commitClip({ id: randomUUID(), type: 'text', createdAt: Date.now(), text })
  },

  addImage(img: NativeImage): void {
    const id = randomUUID()
    const { width, height } = img.getSize()
    const file = join(clipboardImagesDir(), `${id}.png`)
    mkdirSync(clipboardImagesDir(), { recursive: true })
    writeFileSync(file, img.toPNG())
    imageDataUrlCache.set(id, img.toDataURL())
    commitClip({ id, type: 'image', createdAt: Date.now(), file, width, height })
  },

  /** Wire shapes for the renderer (image PNGs resolved to data URLs, cached). */
  list(): ClipItem[] {
    return clipStore.get().map((item) => {
      if (item.type === 'text') {
        return { id: item.id, type: 'text', createdAt: item.createdAt, text: item.text }
      }
      let dataUrl = imageDataUrlCache.get(item.id)
      if (!dataUrl) {
        dataUrl = existsSync(item.file)
          ? `data:image/png;base64,${readFileSync(item.file).toString('base64')}`
          : ''
        if (dataUrl) imageDataUrlCache.set(item.id, dataUrl)
      }
      return {
        id: item.id,
        type: 'image',
        createdAt: item.createdAt,
        dataUrl,
        width: item.width,
        height: item.height
      }
    })
  },

  /** What to write back to the system clipboard when a history item is clicked. */
  writeTarget(id: string): { kind: 'text'; text: string } | { kind: 'image'; file: string } | null {
    const item = clipStore.get().find((i) => i.id === id)
    if (!item) return null
    return item.type === 'text' ? { kind: 'text', text: item.text } : { kind: 'image', file: item.file }
  },

  clear(): void {
    for (const item of clipStore.get()) {
      if (item.type === 'image') deleteImageFile(item)
    }
    clipStore.set([])
  },

  flush(): void {
    clipStore.flush()
  }
}

// ─── Files store ──────────────────────────────────────────────────────────────

type StoredFileItem = { path: string; name: string; addedAt: number }

const filesData = new JsonStore<StoredFileItem[]>('files.json', [])
/** path -> icon data URL. getFileIcon is async + not free; cache per session. */
const iconCache = new Map<string, string>()

async function iconFor(path: string): Promise<string> {
  const cached = iconCache.get(path)
  if (cached) return cached
  const icon = await app.getFileIcon(path, { size: 'normal' })
  const dataUrl = icon.toDataURL()
  iconCache.set(path, dataUrl)
  return dataUrl
}

async function toFileItems(stored: StoredFileItem[]): Promise<FileItem[]> {
  return Promise.all(
    stored.map(async (f) => ({
      path: f.path,
      name: f.name,
      addedAt: f.addedAt,
      iconDataUrl: await iconFor(f.path)
    }))
  )
}

export const filesStore = {
  /** Drop entries whose file no longer exists, persisting the pruned list. */
  async list(): Promise<FileItem[]> {
    const stored = filesData.get()
    const alive = stored.filter((f) => existsSync(f.path))
    if (alive.length !== stored.length) filesData.set(alive)
    return toFileItems(alive)
  },

  async add(paths: string[]): Promise<FileItem[]> {
    const stored = filesData.get()
    const known = new Set(stored.map((f) => f.path))
    const additions: StoredFileItem[] = paths
      .filter((p) => p && existsSync(p) && !known.has(p))
      .map((p) => ({ path: p, name: basename(p), addedAt: Date.now() }))
    if (additions.length) filesData.set([...stored, ...additions])
    return this.list()
  },

  async remove(path: string): Promise<FileItem[]> {
    iconCache.delete(path)
    filesData.set(filesData.get().filter((f) => f.path !== path))
    return this.list()
  },

  flush(): void {
    filesData.flush()
  }
}
