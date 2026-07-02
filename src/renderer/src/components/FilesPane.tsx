import { useEffect, useState } from 'react'
import type { FileItem } from '../../../shared/types'

/**
 * Drag-and-drop file shelf. Dropped files are resolved to absolute paths in the
 * preload (`getPathForFile`), then the main process attaches each file's real
 * macOS icon and persists the list. Rendered desktop-style: icon + filename.
 */
export function FilesPane(): React.JSX.Element {
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    window.panel.files.list().then(setFiles)
  }, [])

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.panel.files.getPathForFile(f))
      .filter((p) => p !== '')
    if (paths.length) window.panel.files.add(paths).then(setFiles)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={[
        'h-full rounded-md transition-colors',
        dragging ? 'bg-white/10 ring-1 ring-white/30' : ''
      ].join(' ')}
    >
      {files.length === 0 ? (
        <div className="grid h-full place-items-center px-4 text-center text-xs text-neutral-400">
          Drag files here
        </div>
      ) : (
        <div className="flex gap-3">
          {files.map((file) => (
            <div
              key={file.path}
              onDoubleClick={() => window.panel.files.open(file.path)}
              title={file.name}
              className="group relative flex flex-col items-center gap-1.5 px-2 py-3 hover:bg-white/10 rounded-md cursor-pointer"
            >
              <button
                type="button"
                onClick={() => window.panel.files.remove(file.path).then(setFiles)}
                title="Remove"
                className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] text-neutral-200 group-hover:grid hover:bg-black"
              >
                ✕
              </button>
              <img src={file.iconDataUrl} alt="" className="h-11 w-11" />
              <span className="line-clamp-2 max-w-[9rem] break-words text-center text-xs text-neutral-300">
                {file.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
