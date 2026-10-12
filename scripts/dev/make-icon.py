"""生成 LifeOS 应用图标（1024x1024 PNG，Windows/macOS 共用）。

用法：
    python scripts/dev/make-icon.py                      # 生成 build/icon.png（变体 B）
    python scripts/dev/make-icon.py --variant a          # 生成变体 A
    python scripts/dev/make-icon.py --preview out.png    # 生成多尺寸对比图（供人眼检查）

设计：macOS Big Sur 图标网格（内容 824/1024、圆角 185），深色渐变底 + 三条任务胶囊，
最上方一条用主题色 #7c8cff 并带对勾，呼应「任务/时间轴」的产品语义。
"""
import argparse
import sys
from PIL import Image, ImageDraw

S = 4  # 4 倍超采样
SIZE = 1024
CANVAS = SIZE * S
INSET = 100          # 内容框 824x824
RADIUS = 185
BG_TOP = (50, 52, 63)
BG_BOTTOM = (23, 24, 29)
ACCENT = (124, 140, 255, 255)      # #7c8cff
LIGHT = (215, 218, 230, 255)
MUTED = (106, 109, 124, 255)
INK = (23, 24, 29, 255)

BAR_W, BAR_H, BAR_GAP = 444, 88, 52
BAR_X = 290
BAR_Y0 = 328
BAR_W3 = 300


def _px(v: float) -> int:
    return int(round(v * S))


def gradient() -> Image.Image:
    col = Image.new("RGB", (1, CANVAS))
    d = ImageDraw.Draw(col)
    for y in range(CANVAS):
        t = y / (CANVAS - 1)
        d.point((0, y), fill=tuple(int(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t)) for i in range(3)))
    return col.resize((CANVAS, CANVAS), Image.NEAREST).convert("RGBA")


def squircle_mask() -> Image.Image:
    m = Image.new("L", (CANVAS, CANVAS), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([_px(INSET), _px(INSET), _px(SIZE - INSET) - 1, _px(SIZE - INSET) - 1], radius=_px(RADIUS), fill=255)
    return m


def pill(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, fill) -> None:
    d.rounded_rectangle([_px(x), _px(y), _px(x + w) - 1, _px(y + h) - 1], radius=_px(h / 2), fill=fill)


def check(d: ImageDraw.ImageDraw, cx: float, cy: float, color) -> None:
    pts = [(cx - 38, cy + 2), (cx - 11, cy + 26), (cx + 42, cy - 27)]
    d.line([(_px(p[0]), _px(p[1])) for p in pts], fill=color, width=_px(22), joint="curve")
    for p in pts:  # line 没有圆头端点，两端补圆点
        r = 11
        d.ellipse([_px(p[0] - r), _px(p[1] - r), _px(p[0] + r), _px(p[1] + r)], fill=color)


def build(variant: str) -> Image.Image:
    base = gradient()
    art = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)

    pill(d, BAR_X, BAR_Y0, BAR_W, BAR_H, ACCENT)
    pill(d, BAR_X, BAR_Y0 + BAR_H + BAR_GAP, BAR_W, BAR_H, LIGHT)
    pill(d, BAR_X, BAR_Y0 + 2 * (BAR_H + BAR_GAP), BAR_W3, BAR_H, MUTED)

    if variant == "a":
        check(d, BAR_X + BAR_W / 2, BAR_Y0 + BAR_H / 2, INK)
    else:
        # 变体 B：对勾靠左，右侧留一段"已完成"的呼吸感
        check(d, BAR_X + 108, BAR_Y0 + BAR_H / 2, INK)
        d.ellipse([_px(BAR_X + BAR_W - 108), _px(BAR_Y0 + 26), _px(BAR_X + BAR_W - 56), _px(BAR_Y0 + 26 + 52)],
                  fill=(255, 255, 255, 90))

    base.alpha_composite(art)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(base, (0, 0), squircle_mask())
    return out.resize((SIZE, SIZE), Image.LANCZOS)


def preview(icon: Image.Image, path: str) -> None:
    sizes = [256, 128, 64, 32]
    pad = 40
    w = pad + sum(s + pad for s in sizes)
    h = 256 + 2 * pad
    sheet = Image.new("RGB", (w, h), (245, 246, 248))
    x = pad
    sheet.paste(icon.resize((256, 256), Image.LANCZOS), (x, pad), icon.resize((256, 256), Image.LANCZOS))
    x += 256 + pad
    for s in sizes:
        small = icon.resize((s, s), Image.LANCZOS)
        sheet.paste(small, (x, pad + (256 - s) // 2), small)
        x += s + pad
    sheet.save(path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["a", "b"], default="b")
    ap.add_argument("--out", default="build/icon.png")
    ap.add_argument("--preview", default=None)
    args = ap.parse_args()

    icon = build(args.variant)
    icon.save(args.out)
    print(f"wrote {args.out} ({icon.size[0]}x{icon.size[1]}) variant={args.variant}")
    if args.preview:
        preview(icon, args.preview)
        print(f"wrote {args.preview}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
