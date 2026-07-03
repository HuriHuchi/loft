<div align="center">

![Loft](docs/banner.svg)

# Loft

**A top slide-down shelf for macOS — stash your clipboard, notes, and files, a scroll away.**

[![Release](https://github.com/HuriHuchi/loft/actions/workflows/release-please.yml/badge.svg)](https://github.com/HuriHuchi/loft/actions/workflows/release-please.yml)
[![Latest release](https://img.shields.io/github/v/release/HuriHuchi/loft?sort=semver)](https://github.com/HuriHuchi/loft/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)

</div>

---

Loft lives in your menu bar with no Dock icon. Flick your cursor to the top of the
screen and **scroll down** — a shelf slides out of the menu bar with three panes:
your **clipboard history**, a **scratch note**, and a **drag-and-drop file tray**.
Scroll back up (or hit `Esc`) and it tucks away. It never steals focus, so it
overlays whatever you're working in.

<div align="center">

![Loft — Clipboard, Notes, and Files panes](docs/screenshot.png)

</div>

<!--
  DEMO — a GIF of the reveal gesture would round this out. Capture a short screen
  recording of scrolling down at the top edge, save as docs/demo.gif, then
  uncomment the line below. See "Capturing media".
-->
<!-- <div align="center"><img src="docs/demo.gif" alt="Loft reveal demo" width="820"></div> -->

> [!NOTE]
> **Demo GIF wanted.** A short recording of the reveal gesture would complete the
> picture — drop it at `docs/demo.gif` and uncomment the tag above. See
> [Capturing media](#-capturing-media).

## ✨ Features

- **📋 Clipboard history** — every copy (text **and** images) is captured
  automatically, newest first. Click an entry to view it in full and re-copy it to
  the system clipboard in one motion. Hover to remove, or **Clear** the lot.
- **📝 Scratch notes** — a persistent textarea that's always one scroll away.
  Debounced autosave; survives reveal, hide, and restart.
- **🗂️ File tray** — drag files onto the shelf to park them. Each shows its real
  macOS icon; double-click to open, hover to remove.
- **🖱️ Scroll-to-reveal** — a global gesture at the top edge of the screen. No
  hotkey to memorize, no window to manage.
- **🎛️ Resizable panes** — drag the dividers; your layout is remembered.
- **🪶 Menu-bar native** — no Dock icon, never steals focus, GPU-cheap slide.
- **🔄 Auto-update** — quiet background updates from GitHub Releases.

## 📦 Install

Grab the latest `.dmg` for your chip from the
[**Releases**](https://github.com/HuriHuchi/loft/releases/latest) page:

| Chip | File |
| --- | --- |
| Apple Silicon (M1–M4) | `Loft-<version>-arm64.dmg` |
| Intel | `Loft-<version>-x64.dmg` |

Open the `.dmg` and drag **Loft** to Applications.

> [!IMPORTANT]
> Loft is currently distributed **unsigned** (no paid Apple Developer certificate
> yet), so macOS Gatekeeper blocks it on first launch. Clear the quarantine flag
> once after installing:
> ```bash
> xattr -dr com.apple.quarantine /Applications/Loft.app
> ```

### Grant Accessibility permission

The scroll-to-reveal gesture uses a global input hook, which needs **Accessibility**
access. Loft prompts on first launch; if you miss it, enable it manually:

**System Settings → Privacy & Security → Accessibility → enable _Loft_.**

Loft detects the grant and starts working within a couple of seconds — no restart
needed. (Because the build is unsigned, macOS resets this permission on each
update; just toggle it back on.)

## 🛠️ Build from source

**Prerequisites:** [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) 10+.

```bash
git clone https://github.com/HuriHuchi/loft.git
cd loft
pnpm install        # also downloads Electron + rebuilds the native input hook

pnpm dev            # run in development (hot reload)
pnpm build:mac      # produce a distributable .dmg in dist/
```

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Launch the app with hot reload |
| `pnpm typecheck` | Type-check main, preload, and renderer |
| `pnpm build` | Bundle main/preload/renderer to `out/` |
| `pnpm build:mac` | Bundle **and** package a `.dmg` |

## 🧭 How it works

```
┌── main (Node) ───────────────┐     ┌── renderer (React) ──────────┐
│ uiohook-napi global wheel hook│ IPC │ slide-down panel, 3 panes    │
│ → detects scroll at top edge  │◀───▶│ clipboard / notes / files    │
│ tray, clipboard watcher, IPC  │     │ GPU transform for the slide  │
└───────────────────────────────┘     └──────────────────────────────┘
```

- A frameless, transparent window is pinned to the top of the active display and
  shown **without stealing focus** (`showInactive`). Revealing/hiding is a pure CSS
  `translateY` transition on the content — the OS window bounds never animate, so
  the slide stays cheap.
- The reveal/dismiss gesture is decided in the main process from a global wheel
  hook ([`uiohook-napi`](https://github.com/SnosMe/uiohook-napi)); scroll-up inside
  a scrollable list navigates it and only dismisses on overscroll.
- Clipboard history and dropped files persist under the app's `userData`; notes
  live in the renderer's `localStorage`.

**Stack:** Electron 43 · [electron-vite](https://electron-vite.org) · React 19 ·
Tailwind CSS 4 · TypeScript.

## 🚀 Releasing

Releases are fully automated with
[release-please](https://github.com/googleapis/release-please) +
[Conventional Commits](https://www.conventionalcommits.org):

1. Land `feat:` / `fix:` commits on `main` (a commit-msg hook lints the format).
2. release-please opens a **release PR** that bumps the version and updates the
   changelog. Merge it.
3. CI tags the release, builds per-arch `.dmg`s, and publishes them with an
   `latest-mac.yml` auto-update feed.

## 📸 Capturing media

The screenshots/GIF above are placeholders. To capture the panel itself, the dev
build can snapshot it to a PNG without a physical scroll:

```bash
AUTO_REVEAL=1 CAPTURE_PATH=$PWD/docs/screenshot.png pnpm dev
```

For the demo GIF, screen-record the reveal gesture (e.g. with
[Kap](https://getkap.co)) and save it as `docs/demo.gif`. Then uncomment the image
tags near the top of this file.

## 🤝 Contributing

Issues and PRs welcome. Please keep commit messages in Conventional Commits form
(`feat:`, `fix:`, `docs:`, `chore:`, …) so the release automation and changelog
stay accurate.

## 📄 License

[MIT](LICENSE) © 강희욱 ([@HuriHuchi](https://github.com/HuriHuchi))
