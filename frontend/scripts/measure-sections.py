"""Measure y-positions of all sections in given HTML for diff debugging."""
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
  const sels = ['.page','.top','.report-title','.report-meta','.up-card','.up-main h3',
    'section.reasons-3','.freetext-box','.ft-body','section.v6-mid','.v6-eb2','.v6-stack',
    '.eb-foot','section.page-section','.v6-compare','section.card-shell.page-section',
    '.radio-like-eb','.v6-terrain','.v6-radio-data','footer.footer'];
  const out = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      out[sel] = {top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width)};
    } else { out[sel] = null; }
  }
  return out;
}"""
        )
        browser.close()
        return out


if __name__ == "__main__":
    a = measure(sys.argv[1])
    b = measure(sys.argv[2])
    print(json.dumps({"fasit": a, "autogen": b}, indent=2, ensure_ascii=False))
