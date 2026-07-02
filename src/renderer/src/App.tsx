import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ClipboardPane } from './components/ClipboardPane'
import { NotesPane } from './components/NotesPane'
import { FilesPane } from './components/FilesPane'

/** Fallback ratios until the persisted weights load; mirrors the main default. */
const DEFAULT_PANE_WEIGHTS = [1, 1.4, 1]

/** Smallest weight a pane may shrink to under a divider drag, so none collapses. */
const MIN_PANE_WEIGHT = 0.35

/**
 * The panel content. The window itself stays fixed at the top of the screen;
 * we only translate this element so the slide is a cheap GPU transform (see the
 * project plan for why we don't animate the OS window bounds).
 */
function App(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [weights, setWeights] = useState<number[]>(DEFAULT_PANE_WEIGHTS)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load the saved column layout once on mount (the window persists across
  // reveals, so in-session drags stay put; this only restores after a restart).
  useEffect(() => {
    window.panel.panes.getWidths().then(setWeights)
  }, [])

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

  // Begin a divider drag between pane `index` and `index + 1`. We snapshot the
  // weights + pointer origin at pointer-down and track on `window` (not the
  // divider element) so the drag keeps following the cursor even when it slips
  // off the thin handle. On release we push the final layout to disk once.
  const startDrag = (index: number) => (e: React.PointerEvent): void => {
    e.preventDefault()
    const containerPx = containerRef.current?.clientWidth ?? 1
    const startX = e.clientX
    const startWeights = weights
    let latest = weights
    setDragging(true)

    const onMove = (ev: PointerEvent): void => {
      latest = resizeAt(index, ev.clientX - startX, containerPx, startWeights)
      setWeights(latest)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(false)
      window.panel.panes.setWidths(latest)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const panes: { key: string; title: string; className: string; headerRight?: ReactNode; body: ReactNode }[] = [
    {
      key: 'clipboard',
      title: 'Clipboard',
      className: 'bg-[#3a3a3c] text-neutral-200',
      headerRight: (
        <button
          type="button"
          onClick={() => window.panel.clipboard.clear()}
          className="text-[11px] opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
        >
          Clear
        </button>
      ),
      body: <ClipboardPane />
    },
    { key: 'notes', title: 'Notes', className: 'bg-neutral-200 text-neutral-800', body: <NotesPane /> },
    { key: 'files', title: 'Files', className: 'bg-[#3a3a3c] text-neutral-200', body: <FilesPane /> }
  ]

  return (
    <div
      ref={containerRef}
      onTransitionEnd={handleTransitionEnd}
      onWheel={handleWheel}
      className={[
        'flex h-full will-change-transform',
        'shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
        'transition-transform duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
        dragging ? 'cursor-col-resize select-none' : '',
        open ? 'translate-y-0' : '-translate-y-full'
      ].join(' ')}
    >
      {panes.map((pane, i) => (
        <Fragment key={pane.key}>
          <Pane
            title={pane.title}
            className={pane.className}
            style={{ flex: `${weights[i] ?? 1} 1 0` }}
            headerRight={pane.headerRight}
          >
            {pane.body}
          </Pane>
          {i < panes.length - 1 && <Divider onPointerDown={startDrag(i)} />}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Recompute the pane weights when the divider between pane `index` and
 * `index + 1` is dragged `dxPx` pixels from where the drag began. `containerPx`
 * is the panel's full width and `start` is the weights snapshot at pointer-down.
 */
function resizeAt(index: number, dxPx: number, containerPx: number, start: number[]): number[] {
  const totalWeight = start.reduce((sum, w) => sum + w, 0)
  // Pixels -> weight. Guard containerPx so an unmeasured container can't divide by 0.
  const rawDelta = (dxPx / Math.max(containerPx, 1)) * totalWeight

  // The two panes flanking the divider trade weight; their sum is fixed, so the
  // shift each way is bounded by how far the *other* pane can shrink before it
  // hits MIN_PANE_WEIGHT. Clamping the delta (not the final widths) means once a
  // pane bottoms out the cursor can keep moving without the layout drifting.
  const left = start[index]
  const right = start[index + 1]
  const maxRight = right - MIN_PANE_WEIGHT // dragging right: left grows, right shrinks
  const maxLeft = left - MIN_PANE_WEIGHT // dragging left: right grows, left shrinks
  const delta = Math.max(-maxLeft, Math.min(rawDelta, maxRight))

  const next = [...start]
  next[index] = left + delta
  next[index + 1] = right - delta
  return next
}

/** Draggable seam between two panes. A 1px rule with a wider invisible hit area. */
function Divider({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }): React.JSX.Element {
  return (
    <div
      onPointerDown={onPointerDown}
      className={
        'relative z-10 w-px shrink-0 cursor-col-resize bg-white/10 transition-colors hover:bg-white/40 ' +
        // Widen the pointer target to ~13px without taking layout space.
        "after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-['']"
      }
    />
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
  style,
  headerRight,
  children
}: {
  title: string
  className?: string
  style?: CSSProperties
  headerRight?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className={`flex min-w-0 flex-col ${className}`} style={style}>
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
