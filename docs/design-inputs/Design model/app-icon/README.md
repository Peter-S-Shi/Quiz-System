# Quiz Studio V2 App Icon — Concept A "Ink-tail Q"

**Status:** Design Input for the Human Design Gate. Not a frozen brand specification.

## Idea

A Q drawn on warm paper. Its tail is a brush stroke that thins out as it leaves the ring. This matches the prototype's "Warm Paper · Living Ink" language: the cursor flow lines and the ink-line nav indicator. At large sizes a faint blue flow line runs under the letter.

The tail deliberately sweeps out **horizontally** and does not run straight out at 45°. A ring with a straight diagonal handle reads as a magnifier / search icon at 16–32 px.

## Files

| File | Use |
|---|---|
| `quiz-studio-icon.svg` | Master, light paper. Use for 48 px and up |
| `quiz-studio-icon-dark.svg` | Dark-paper variant for in-app or docs on dark surfaces |
| `quiz-studio-icon-small.svg` | Simplified geometry for 16–32 px: heavier ring, horizontal underline tail, no flow line |
| `png/icon-{16,24,32,48,64,128,256,512,1024}.png` | Rasters. 16–32 use the small geometry |
| `png/icon-dark-256.png` | Dark preview |
| `quiz-studio.ico` | Windows icon, PNG-compressed entries 16 / 24 / 32 / 48 / 64 / 256. Each size is rendered separately, not downscaled from one image |
| `build_icon.py` | Single source of geometry. `python build_icon.py` (Pillow) regenerates everything above |

## Construction (1024 grid)

| Element | Master | Small (≤32 px) |
|---|---|---|
| Tile | 64→960, radius 204, edge 10 | 24→1000, radius 220, edge 40 (≥1 px at output) |
| Ring | centre (476, 462), mid-radius 232, stroke 80 | centre (440, 420), mid-radius 226, stroke 132 |
| Ink tail | cubic (640,626)→(884,796), width 72 → 20, round caps, starts on the ring centreline | cubic (556,616)→(912,772), width 124 → 88 |
| Flow line | cubic (150,842)→(884,796), width 4 → 14, flow colour at 55% | none |

## Colours (from the prototype tokens)

| Token | Light | Dark |
|---|---|---|
| Tile (`--paper`) | `#fffdf7` | `#212428` |
| Edge (`--line`) | `#ddd7c9` | `#34383e` |
| Ink (`--ink`) | `#1f2933` | `#ebe6db` |
| Flow (`--blue`) | `#315d8a` | `#86acd4` |

The OS icon (`.ico`) uses the light version on every wallpaper. The paper tile plus edge keeps it legible on both light and dark desktops.

## Integration notes for implementers

- The desktop shell (installer, shortcut, taskbar, window icon) should take `quiz-studio.ico`.
- In-app brand marks can inline the small SVG with `fill`/`stroke` bound to theme tokens; the prototype's sidebar does this.
- If a later packaging target needs macOS `.icns` or other sizes, regenerate from `build_icon.py` rather than resampling the PNGs.
