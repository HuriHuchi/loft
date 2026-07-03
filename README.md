# Loft

A top slide-down shelf for macOS to stash your clipboard, notes, and files — always a gesture away, never in your Dock.

![Loft demo](assets/demo.gif)

## What it is

Loft lives in the menu bar (no Dock icon) and drops a shelf down from the top of your screen when you reveal it. Use it to park clipboard snippets, quick notes, and files you want within reach without cluttering your desktop.

## Install

Download the latest `.dmg` for your Mac from the [Releases](https://github.com/HuriHuchi/loft/releases) page:

- **Apple Silicon** → `Loft-<version>-arm64.dmg`
- **Intel** → `Loft-<version>-x64.dmg`

Loft auto-updates itself once installed.

> On first launch, macOS will ask for **Accessibility** access — Loft needs it to detect the reveal gesture.

## Development

```bash
pnpm install
pnpm dev
```

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the app in development |
| `pnpm build` | Type-check and build |
| `pnpm build:mac` | Build the macOS `.dmg` locally |

Built with Electron, electron-vite, and React.

## License

MIT
