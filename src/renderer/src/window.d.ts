import type { PanelApi } from '../../preload/index'

// Global augmentation so the renderer sees `window.panel` (exposed by the
// preload via contextBridge). Lives in the renderer project — and NOT named
// `index.d.ts` next to a `.ts` — so a composite project's declaration emit
// can't try to overwrite it (which caused TS5055).
declare global {
  interface Window {
    panel: PanelApi
  }
}

export {}
