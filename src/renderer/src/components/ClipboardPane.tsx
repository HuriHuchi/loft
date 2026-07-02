import { useEffect, useState } from 'react'
import type { ClipItem } from '../../../shared/types'

/**
 * Live clipboard history. The main process captures copies (text + images) and
 * pushes updates via `onChanged`; clicking an item opens a detail view with its
 * full contents, from where it can be re-copied to the system clipboard.
 * Newest-first ordering comes from the store, so we render as-is.
 */
export function ClipboardPane(): React.JSX.Element {
  const [items, setItems] = useState<ClipItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    window.panel.clipboard.list().then(setItems)
    return window.panel.clipboard.onChanged(setItems)
  }, [])

  // Resolve against the live list so a selected item that gets cleared/evicted
  // falls back to the list instead of showing stale detail.
  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null

  if (selected) {
    return <ClipboardDetail item={selected} onBack={() => setSelectedId(null)} />
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">Copy something to start your history.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id} className="group relative">
          <button
            type="button"
            onClick={() => window.panel.clipboard.remove(item.id)}
            title="Remove"
            className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] text-neutral-200 group-hover:grid hover:bg-black"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => setSelectedId(item.id)}
            title="Click to view"
            className="w-full rounded bg-white/5 px-2 py-1.5 text-left transition-colors hover:bg-white/15 cursor-pointer"
          >
            {item.type === 'text' ? (
              <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-neutral-200">
                {item.text}
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                <img
                  src={item.dataUrl}
                  alt={item.name ?? 'clipboard image'}
                  className="max-h-20 w-auto rounded object-contain"
                />
                {item.name && (
                  <span className="truncate text-[11px] text-neutral-400">{item.name}</span>
                )}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ClipboardDetail({
  item,
  onBack
}: {
  item: ClipItem
  onBack: () => void
}): React.JSX.Element {
  // Auto-copy on open (and when switching between items via the list).
  useEffect(() => {
    window.panel.clipboard.copy(item.id)
  }, [item.id])

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-1.5 py-0.5 text-xs text-neutral-300 transition-colors hover:bg-white/10 cursor-pointer"
        >
          ← Back
        </button>
        <span className="text-[11px] text-neutral-500">{formatTime(item.createdAt)}</span>
        <span className="text-xs font-medium text-emerald-400">Copied!</span>
      </div>

      {item.type === 'text' ? (
        <pre className="min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-white/5 px-2 py-1.5 text-xs text-neutral-200">
          {item.text}
        </pre>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
          <img
            src={item.dataUrl}
            alt={item.name ?? 'clipboard image'}
            className="w-full rounded object-contain"
          />
          <span className="text-[11px] text-neutral-500">
            {item.name ? `${item.name} · ` : ''}
            {item.width}×{item.height}
          </span>
        </div>
      )}
    </div>
  )
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString()
}
