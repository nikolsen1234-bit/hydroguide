"""Render fasit + autogen report HTML in Playwright, screenshot at A4 size,
diff per-pixel, and write a heatmap + per-row mismatch report.

Usage:
  python report-pixel-diff.py <fasit.html> <autogen.html> <out-dir>
"""
import sys
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops


def render(url: str, out_png: Path):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # A4 at 96dpi: 210mm × 297mm => 794 × 1123 px
        ctx = browser.new_context(viewport={"width": 794, "height": 1123}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(800)
        # Crop to just the .page element
        loc = page.locator(".page").first
        loc.screenshot(path=str(out_png))
        browser.close()


def diff(a_path: Path, b_path: Path, out_dir: Path):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        # resize b to match a
        b = b.resize(a.size)
    d = ImageChops.difference(a, b)
    bbox = d.getbbox()
    # Heatmap: amplify diff
    px = d.load()
    w, h = d.size
    total = 0
    diff_rows = {}
    for y in range(h):
        row = 0
        for x in range(w):
            r, g, bl = px[x, y]
            v = max(r, g, bl)
            if v > 8:
                row += 1
                total += 1
        if row > 5:
            diff_rows[y] = row
    d.save(out_dir / "diff-raw.png")
    # Threshold heatmap
    heat = Image.new("RGB", (w, h), (0, 0, 0))
    hp = heat.load()
    for y in range(h):
        for x in range(w):
            r, g, bl = px[x, y]
            v = max(r, g, bl)
            if v > 8:
                hp[x, y] = (255, 0, 0)
    heat.save(out_dir / "diff-heat.png")
    return {
        "size": a.size,
        "bbox": bbox,
        "total_diff_pixels": total,
        "diff_rows_top": sorted(diff_rows.items(), key=lambda kv: -kv[1])[:20],
    }


def main():
    fasit_html, autogen_html, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    fasit_url = "file:///" + os.path.abspath(fasit_html).replace("\\", "/")
    auto_url = "file:///" + os.path.abspath(autogen_html).replace("\\", "/")
    fasit_png = out_dir / "fasit.png"
    auto_png = out_dir / "autogen.png"
    render(fasit_url, fasit_png)
    render(auto_url, auto_png)
    result = diff(fasit_png, auto_png, out_dir)
    print(result)


if __name__ == "__main__":
    main()
