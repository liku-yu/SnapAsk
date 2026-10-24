#!/usr/bin/env python3
"""Generate SnapAsk PNG icons without external dependencies."""

import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

ACCENT_A = (79, 70, 229)     # #4f46e5
ACCENT_B = (139, 92, 246)    # #8b5cf6
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def star_polygon(cx, cy, outer, inner, points=4, rotation=math.pi / 4):
    verts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        angle = rotation + i * math.pi / points
        verts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return verts


def point_in_polygon(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
                inside = not inside
        j = i
    return inside


def render(size, ss):
    n = size * ss
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    margin = 0.02 * n
    x0, y0, x1, y1 = margin, margin, n - margin, n - margin
    radius = 0.26 * n

    cx, cy = 0.46 * n, 0.45 * n
    main_star = star_polygon(cx, cy, 0.30 * n, 0.075 * n)
    small_star = star_polygon(0.72 * n, 0.72 * n, 0.105 * n, 0.028 * n)

    for oy in range(size):
        for ox in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = ox * ss + sx + 0.5
                    y = oy * ss + sy + 0.5
                    if not in_rounded_rect(x, y, x0, y0, x1, y1, radius):
                        continue
                    t = (x + y - 2 * margin) / (2 * (n - 2 * margin))
                    t = min(1.0, max(0.0, t))
                    r, g, b = lerp(ACCENT_A, ACCENT_B, t)
                    if point_in_polygon(x, y, main_star):
                        r, g, b, a = WHITE[0], WHITE[1], WHITE[2], 1.0
                    elif point_in_polygon(x, y, small_star):
                        r, g, b, a = WHITE[0], WHITE[1], WHITE[2], 0.72
                    else:
                        a = 1.0
                    # premultiply for correct edge averaging
                    r_acc += r * a
                    g_acc += g * a
                    b_acc += b * a
                    a_acc += a
            total = ss * ss
            alpha = a_acc / total
            if alpha <= 0.0001:
                px[oy][ox] = (0, 0, 0, 0)
            else:
                px[oy][ox] = (
                    round(r_acc / a_acc),
                    round(g_acc / a_acc),
                    round(b_acc / a_acc),
                    round(alpha * 255),
                )
    return px


def write_png(path, px):
    height = len(px)
    width = len(px[0])
    raw = bytearray()
    for row in px:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        ss = 10 if size <= 48 else 5
        px = render(size, ss)
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        write_png(path, px)
        print("wrote", path)


if __name__ == "__main__":
    main()
