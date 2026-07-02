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
