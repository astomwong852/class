#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
課堂網頁 QR Code 生成器

用法：
    python qr.py https://xxx.github.io/class-hub/
    python qr.py https://xxx.github.io/class-hub/ 課堂入口
    python qr.py --all "https://xxx.github.io/class-hub/"

輸出：同資料夾嘅 qr/ 入面，PNG 可直接投影或列印。
"""
import sys, os, re, json

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("請先安裝：python -m pip install qrcode[pil]")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qr")


def _font(size):
    """搵一個有中文嘅字體。"""
    for p in (
        r"C:\Windows\Fonts\msjh.ttc",      # 微軟正黑
        r"C:\Windows\Fonts\mingliu.ttc",
        r"C:\Windows\Fonts\simsun.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/noto/Noto Sans CJK.ttf",
    ):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make(url, label=None, filename=None):
    os.makedirs(OUT, exist_ok=True)

    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M,
                       box_size=12, border=3)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    if label:
        # 底部留白加標題
        pad_b, size = 78, 30
        W, H = img.size
        canvas = Image.new("RGB", (W, H + pad_b), "white")
        canvas.paste(img, (0, 0))
        d = ImageDraw.Draw(canvas)
        f = _font(size)
        box = d.textbbox((0, 0), label, font=f)
        d.text(((W - (box[2] - box[0])) / 2, H + 20), label, fill="black", font=f)
        img = canvas

    name = filename or re.sub(r"[^\w\-]+", "_", url.rstrip("/").split("/")[-1] or "qr")
    path = os.path.join(OUT, f"{name}.png")
    img.save(path, "PNG")
    print(f"[OK] {path}  <-  {url}")
    return path


def main():
    args = [a for a in sys.argv[1:] if a != "--all"]
    if not args:
        print(__doc__)
        return 1

    url = args[0]
    label = args[1] if len(args) > 1 else None

    if "--all" in sys.argv:
        # 為 index.html 入面每個活動各生一個 QR
        make(url, label or "課堂入口", "index")
        idx = os.path.join(HERE, "index.html")
        if os.path.exists(idx):
            html = open(idx, encoding="utf-8").read()
            for m in re.finditer(
                r"\{\s*title:\s*[\"']([^\"']+)[\"'][^}]*?file:\s*[\"']([^\"']+)[\"']",
                html, re.S
            ):
                title, f = m.group(1), m.group(2)
                full = url.rstrip("/") + "/" + f.lstrip("/")
                make(full, title, re.sub(r"[^\w\-]+", "_", f.rsplit(".", 1)[0]))
    else:
        make(url, label)

    return 0


if __name__ == "__main__":
    sys.exit(main())
