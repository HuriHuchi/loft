import { useEffect, useState, type ReactNode } from 'react'
import { ClipboardPane } from './components/ClipboardPane'
import { NotesPane } from './components/NotesPane'
import { FilesPane } from './components/FilesPane'

/**
 * The panel content. The window itself stays fixed at the top of the screen;
 * we only translate this element so the slide is a cheap GPU transform (see the
 * project plan for why we don't animate the OS window bounds).
 */
function App(): React.JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const offReveal = window.panel.onReveal(() => setOpen(true))
    const offHide = window.panel.onHide(() => setOpen(false))

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.panel.dismiss()
    }

    window.addEventListener('keydown', onKey)

    return () => {
      offReveal()
      offHide()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Scroll-up over the panel is a dismiss gesture, but only once the content
  // under the cursor has nothing left to scroll (overscroll). Walk from the
  // cursor's element to the nearest vertically scrollable ancestor: if there is
  // none, or it's already pinned to the top, the upward scroll "escapes" to the
  // panel and dismisses it. Otherwise the browser scrolls that content normally
  // — so scrolling within a long list navigates it instead of closing.
  const handleWheel = (e: React.WheelEvent): void => {
    if (!open || e.deltaY >= 0) return
    const target = e.target as HTMLElement | null
    // A text field under the cursor always owns the scroll: the user is reading
    // or editing there, so scrolling must never yank the panel away — not even
    // for a short note that doesn't overflow (which has no scroll to consume and
    // would otherwise fall straight through to dismiss).
    if (target?.closest('textarea, input')) return
    const scrollable = findScrollableAncestor(target)
    if (!scrollable || scrollable.scrollTop <= 0) window.panel.dismiss()
  }

  // When the slide-UP transition finishes, tell main it's safe to hide the window.
  // Tailwind v4's `translate-y-*` animates the CSS `translate` property (not
  // `transform`), so the finished-property name is 'translate'. Accept both so a
  // future switch back to a transform-based slide keeps working.
  const handleTransitionEnd = (e: React.TransitionEvent): void => {
    if ((e.propertyName === 'translate' || e.propertyName === 'transform') && !open) {
      window.panel.notifyHidden()
    }
  }

  return (
    <div
      onTransitionEnd={handleTransitionEnd}
      onWheel={handleWheel}
      className={[
        'flex h-full will-change-transform',
        'shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
        'transition-transform duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
        open ? 'translate-y-0' : '-translate-y-full'
      ].join(' ')}
    >
      <Pane
        title="Clipboard"
        className="flex-1 bg-[#3a3a3c] text-neutral-200"
        headerRight={
          <button
            type="button"
            onClick={() => window.panel.clipboard.clear()}
            className="text-[11px] opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
          >
            Clear
          </button>
        }
      >
        <ClipboardPane />
      </Pane>

      <Pane title="Notes" className="flex-[1.4] bg-neutral-200 text-neutral-800">
        <NotesPane />
      </Pane>

      <Pane title="Files" last className="flex-1 bg-[#3a3a3c] text-neutral-200">
        <FilesPane />
      </Pane>
    </div>
  )
}

/**
 * Nearest ancestor (inclusive of `start`) that can actually scroll vertically,
 * or null. "Can scroll" = content overflows AND `overflow-y` allows it; a
 * `<textarea>` counts inherently since it scrolls its own content regardless of
 * the computed overflow value. Stops at `<body>`, which never scrolls here.
 */
function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let el = start
  while (el && el !== document.body) {
    // 스크롤이 생겼는지 확인
    if (el.scrollHeight > el.clientHeight) {
      const overflowY = getComputedStyle(el).overflowY
      if (el.tagName === 'TEXTAREA' || overflowY === 'auto' || overflowY === 'scroll') {
        return el
      }
    }
    el = el.parentElement
  }
  return null
}

/** One column of the panel. Header color/opacity is inherited from the pane. */
function Pane({
  title,
  className = '',
  last = false,
  headerRight,
  children
}: {
  title: string
  className?: string
  last?: boolean
  headerRight?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section
      className={`flex min-w-0 flex-col ${last ? '' : 'border-r border-white/10'} ${className}`}
    >
      <header className="relative py-1.5 text-center text-xs opacity-60">
        {title}
        {headerRight && (
          <div className="absolute inset-y-0 right-2 flex items-center">{headerRight}</div>
        )}
      </header>
      {/* min-h-0 lets the body shrink so its own overflow scrolls instead of the column. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">{children}</div>
    </section>
  )
}

export default App
