import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'loft.notes'

/**
 * A scratch textarea. Notes are renderer-only data, so they live in
 * localStorage (Chromium's profile under userData) — no IPC needed, and they
 * survive both hide/reveal (the window is never recreated) and app restart.
 * Writes are debounced so typing doesn't hammer localStorage.
 */
export function NotesPane(): React.JSX.Element {
  const [value, setValue] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => localStorage.setItem(STORAGE_KEY, next), 300)
  }

  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder="Jot something down…"
      spellCheck={false}
      className="h-full w-full resize-none bg-transparent text-sm leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
    />
  )
}
