/**
 * Types shared across main, preload, and renderer.
 *
 * MUST stay type-only with zero runtime imports: the renderer imports this file
 * and cannot pull in `electron` (or any Node/main-only module). The on-disk
 * shapes (e.g. an image clip that stores a PNG file path) live inside
 * `src/main/store.ts` and never appear here — the renderer only ever sees the
 * wire shapes below.
 */

/** A copied plain-text snippet. */
export type TextClipItem = {
  id: string
  type: 'text'
  createdAt: number
  text: string
}

/** A copied image. `dataUrl` is a `data:image/png;base64,...` payload. */
export type ImageClipItem = {
  id: string
  type: 'image'
  createdAt: number
  dataUrl: string
  width: number
  height: number
}

/** One entry in the clipboard history. */
export type ClipItem = TextClipItem | ImageClipItem

/** A file dropped onto the Files pane, shown desktop-style. */
export type FileItem = {
  path: string
  name: string
  /** `data:image/png;base64,...` of the file's real macOS icon. */
  iconDataUrl: string
  addedAt: number
}
