import { useEffect, useState } from 'react'
import type { ClipItem } from '../../../shared/types'

/**
 * Live clipboard history. The main process captures copies (text + images) and
 * pushes updates via `onChanged`; clicking an item re-copies it to the system
 * clipboard. Newest-first ordering comes from the store, so we render as-is.
 */
export function ClipboardPane(): React.JSX.Element {
  const [items, setItems] = useState<ClipItem[]>([])

  useEffect(() => {
    window.panel.clipboard.list().then(setItems)
    return window.panel.clipboard.onChanged(setItems)
  }, [])

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">Copy something to start your history.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => window.panel.clipboard.copy(item.id)}
            title="Click to copy"
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
