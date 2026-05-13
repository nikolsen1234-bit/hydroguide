"""Measure .report-logo position+size in both."""
import sys, os, json
from playwright.sync_api import sync_playwright


def measure(path):
    url = "file:///" + os.path.abspath(path).replace("\\", "/")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 794, "height": 1123}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(800)
        out = page.evaluate(
            """() => {
  const el = document.querySelector('.report-logo, img');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {top: r.top, left: r.left, w: r.width, h: r.height, position: cs.position, viewBox: el.getAttribute('viewBox')};
}"""
        )
        browser.close()
        return out


if __name__ == "__main__":
    a = measure(sys.argv[1])
    b = measure(sys.argv[2])
    print(json.dumps({"fasit": a, "autogen": b}, indent=2))
