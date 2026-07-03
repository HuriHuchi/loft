import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'loft.notes.v2'
const LEGACY_KEY = 'loft.notes'

export interface Note {
  id: string
  body: string
  updatedAt: number
}

type NotesView = 'list' | 'editor'

export interface NotesController {
  notes: Note[]
  view: NotesView
  activeNote: Note | null
  openList: () => void
  openNote: (id: string) => void
  createNote: () => void
  updateActiveBody: (body: string) => void
  deleteNote: (id: string) => void
}

/** Context-independent id (randomUUID needs a secure context; this doesn't). */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Most recent first. */
function byRecent(a: Note, b: Note): number {
  return b.updatedAt - a.updatedAt
}

/** Load notes, migrating a legacy single-note string on first run. */
function loadNotes(): Note[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Note[]
      if (Array.isArray(parsed)) return parsed
    } catch {
      // corrupt payload — fall through to a fresh start rather than crash
    }
  }
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy && legacy.trim()) {
    return [{ id: newId(), body: legacy, updatedAt: Date.now() }]
  }
  return []
}

/**
 * Owns the notes list, the current view (list vs editor), and persistence.
 * Notes are renderer-only, so this all lives in localStorage (Chromium's profile
 * under userData) — no IPC, and it survives hide/reveal and restart.
 *
 * Lifted to a hook because the pane *header* (the toggle icon, rendered by App
 * via `headerRight`) and the pane *body* must share one source of truth. App
 * calls this once and wires both slots to the returned controller.
 */
export function useNotes(): NotesController {
  const [notes, setNotes] = useState<Note[]>(loadNotes)
  // Default to editing the most recent note (preserves the old single-note feel);
  // fall back to the list when there's nothing to edit yet.
  const [activeId, setActiveId] = useState<string | null>(() =>
    notes.length ? [...notes].sort(byRecent)[0].id : null
  )
  const [view, setView] = useState<NotesView>(() => (notes.length ? 'editor' : 'list'))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced persistence: any structural or body change flushes 300ms later,
  // matching the original textarea's write cadence. The first run also finalizes
  // the legacy→v2 migration by writing the converted array back.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [notes])

  const activeNote = notes.find((n) => n.id === activeId) ?? null

  const openList = (): void => setView('list')

  const openNote = (id: string): void => {
    setActiveId(id)
    setView('editor')
  }

  const createNote = (): void => {
    const note: Note = { id: newId(), body: '', updatedAt: Date.now() }
    setNotes((prev) => [note, ...prev])
    setActiveId(note.id)
    setView('editor')
  }

  const updateActiveBody = (body: string): void => {
    if (!activeId) return
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, body, updatedAt: Date.now() } : n)))
  }

  const deleteNote = (id: string): void => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    if (id === activeId) {
      setActiveId(null)
      setView('list')
    }
  }

  return { notes, view, activeNote, openList, openNote, createNote, updateActiveBody, deleteNote }
}

/** Cap the label so a runaway single line can't bloat the list DOM. */
const TITLE_MAX = 80

/**
 * The one-line label shown for a note in the list: the first non-blank line,
 * trimmed and length-capped, or a fallback for an empty note.
 */
function deriveNoteTitle(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0)?.trim()
  if (!firstLine) return 'Untitled note'
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX)}…` : firstLine
}

/** Compact timestamp for a list row, e.g. "Jul 3, 09:41". */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * The pane header's right-side control. In the editor it's a list icon back to
 * the list; in the list it's a plus to start a new note.
 */
export function NotesHeaderRight({ notes }: { notes: NotesController }): React.JSX.Element {
  const isList = notes.view === 'list'
  return (
    <button
      type="button"
      onClick={isList ? notes.createNote : notes.openList}
      title={isList ? 'New note' : 'All notes'}
      aria-label={isList ? 'New note' : 'All notes'}
      className="flex items-center opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
    >
      {isList ? <PlusIcon /> : <ListIcon />}
    </button>
  )
}

/** Notes pane body: the active note's editor, or the list of all notes. */
export function NotesPane({ notes }: { notes: NotesController }): React.JSX.Element {
  if (notes.view === 'editor' && notes.activeNote) {
    return <NoteEditor note={notes.activeNote} onChange={notes.updateActiveBody} />
  }
  return <NoteList notes={notes} />
}

function NoteEditor({
  note,
  onChange
}: {
  note: Note
  onChange: (body: string) => void
}): React.JSX.Element {
  return (
    <textarea
      // Remount on note switch so the caret/scroll position resets per note.
      key={note.id}
      value={note.body}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Jot something down…"
      spellCheck={false}
      className="h-full w-full resize-none bg-transparent text-sm leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
    />
  )
}

function NoteList({ notes }: { notes: NotesController }): React.JSX.Element {
  const ordered = [...notes.notes].sort(byRecent)

  if (!ordered.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-neutral-500">No notes yet</p>
        <button
          type="button"
          onClick={notes.createNote}
          className="text-xs text-neutral-600 underline-offset-2 hover:underline cursor-pointer"
        >
          Create your first note
        </button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {ordered.map((n) => (
        <li key={n.id} className="group relative">
          <button
            type="button"
            onClick={() => notes.openNote(n.id)}
            className="w-full rounded-md px-2 py-1.5 pr-7 text-left transition-colors hover:bg-black/5 cursor-pointer"
          >
            <span className="block truncate text-sm text-neutral-800">{deriveNoteTitle(n.body)}</span>
            <span className="block text-[11px] text-neutral-400">{formatTime(n.updatedAt)}</span>
          </button>
          <button
            type="button"
            onClick={() => notes.deleteNote(n.id)}
            title="Delete note"
            aria-label="Delete note"
            className="absolute right-1.5 top-1.5 flex text-neutral-500 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Icons (inline SVG, inherit currentColor) ────────────────────────────────

function ListIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}
