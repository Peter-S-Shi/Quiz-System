"""Build the Quiz Studio V2 app icon (concept A: ink-tail Q).

One geometry source drives every output:
  - quiz-studio-icon.svg        master, light paper (64 px and up)
  - quiz-studio-icon-dark.svg   dark paper variant (in-app / docs)
  - quiz-studio-icon-small.svg  simplified for 16-32 px
  - png/icon-<size>.png         16 24 32 48 64 128 256 512 1024
  - quiz-studio.ico             16 24 32 48 64 256, PNG-compressed entries

Run:  python build_icon.py   (requires Pillow)
"""
from __future__ import annotations

import io
import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
GRID = 1024  # design grid

LIGHT = {"tile": "#fffdf7", "edge": "#ddd7c9", "ink": "#1f2933", "flow": "#315d8a"}
DARK = {"tile": "#212428", "edge": "#34383e", "ink": "#ebe6db", "flow": "#86acd4"}


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


def stroke_outline(ctrl, w0, w1, n=72, ease=0.8):
    """Polygon for a tapered brush stroke along a cubic, with round caps."""
    pts = [bezier(*ctrl, i / n) for i in range(n + 1)]
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        w = (w0 + (w1 - w0) * (i / n) ** ease) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))

    def cap(center, r, ang, flip):
        return [
            (center[0] + r * math.cos(ang + flip * k * math.pi / 12),
             center[1] + r * math.sin(ang + flip * k * math.pi / 12))
            for k in range(1, 12)
        ]

    def heading(i, j):
        return math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0])

    end_cap = cap(pts[-1], w1 / 2, heading(n - 1, n) + math.pi / 2, -1)
    start_cap = cap(pts[0], w0 / 2, heading(0, 1) - math.pi / 2, -1)
    return left + end_cap + right[::-1] + start_cap


# ---- geometry -------------------------------------------------------------
MASTER = {
    "tile": (64, 64, 960, 960), "radius": 204, "edge": 10,
    "ring": (476, 462, 232, 80),  # cx, cy, mid radius, stroke
    "tail": (((640, 626), (712, 704), (780, 778), (884, 796)), 72, 20),
    "flow": (((150, 842), (380, 806), (640, 864), (884, 796)), 4, 14),
}
SMALL = {
    "tile": (24, 24, 1000, 1000), "radius": 220, "edge": 40,
    "ring": (440, 420, 226, 132),
    "tail": (((556, 616), (606, 712), (700, 772), (912, 772)), 124, 88),
    "flow": None,
}


def svg(g, pal, title):
    x0, y0, x1, y1 = g["tile"]
    cx, cy, r, sw = g["ring"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" role="img">',
        f"<title>{title}</title>",
        f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{g["radius"]}" '
        f'fill="{pal["tile"]}" stroke="{pal["edge"]}" stroke-width="{g["edge"]}"/>',
    ]
    if g["flow"]:
        poly = stroke_outline(g["flow"][0], g["flow"][1], g["flow"][2], ease=1.0)
        parts.append(f'<path d="{path_d(poly)}" fill="{pal["flow"]}" fill-opacity=".55"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{pal["ink"]}" stroke-width="{sw}"/>')
    tail = stroke_outline(*g["tail"])
    parts.append(f'<path d="{path_d(tail)}" fill="{pal["ink"]}"/>')
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def path_d(poly):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in poly) + " Z"


def render(g, pal, size, ss=8):
    S = size * ss
    k = S / GRID
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    x0, y0, x1, y1 = g["tile"]
    edge = max(g["edge"] * k, ss)  # never thinner than 1 output pixel
    d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=g["radius"] * k,
                        fill=pal["tile"], outline=pal["edge"], width=round(edge))
    if g["flow"] and size >= 64:
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(
            [(x * k, y * k) for x, y in stroke_outline(g["flow"][0], g["flow"][1], g["flow"][2], ease=1.0)],
            fill=pal["flow"] + "8c")
        base = Image.alpha_composite(base, layer)
        d = ImageDraw.Draw(base)
    cx, cy, r, sw = g["ring"]
    ro, ri = (r + sw / 2) * k, (r - sw / 2) * k
    d.ellipse([cx * k - ro, cy * k - ro, cx * k + ro, cy * k + ro], fill=pal["ink"])
    d.ellipse([cx * k - ri, cy * k - ri, cx * k + ri, cy * k + ri], fill=pal["tile"])
    d.polygon([(x * k, y * k) for x, y in stroke_outline(*g["tail"])], fill=pal["ink"])
    return base.resize((size, size), Image.LANCZOS)


def write_ico(path, images):
    """ICO with PNG-compressed entries (Vista+), one hand-tuned image per size."""
    blobs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, "PNG")
        blobs.append((im.size[0], buf.getvalue()))
    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    entries, data = b"", b""
    for size, png in blobs:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        data += png
    path.write_bytes(header + entries + data)


def main():
    (OUT / "png").mkdir(exist_ok=True)
    (OUT / "quiz-studio-icon.svg").write_text(svg(MASTER, LIGHT, "Quiz Studio"), encoding="utf-8")
    (OUT / "quiz-studio-icon-dark.svg").write_text(svg(MASTER, DARK, "Quiz Studio"), encoding="utf-8")
    (OUT / "quiz-studio-icon-small.svg").write_text(svg(SMALL, LIGHT, "Quiz Studio"), encoding="utf-8")
    pngs = {}
    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        g = SMALL if size <= 32 else MASTER
        im = render(g, LIGHT, size, ss=8 if size <= 256 else 2)
        im.save(OUT / "png" / f"icon-{size}.png")
        pngs[size] = im
    render(MASTER, DARK, 256).save(OUT / "png" / "icon-dark-256.png")
    write_ico(OUT / "quiz-studio.ico", [pngs[s] for s in (16, 24, 32, 48, 64, 256)])
    print("built:", sorted(p.name for p in OUT.rglob("*") if p.is_file()))


if __name__ == "__main__":
    main()
