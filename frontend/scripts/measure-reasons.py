"""Inspect computed styles for the reasons-3 section to find the 9px mystery."""
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
  const s = document.querySelector('section.reasons-3');
  const f = document.querySelector('section.reasons-3 .freetext-box');
  function box(el){ if(!el) return null; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {top:r.top,bottom:r.bottom,h:r.height,paddingTop:cs.paddingTop,paddingBottom:cs.paddingBottom,marginTop:cs.marginTop,marginBottom:cs.marginBottom,minHeight:cs.minHeight,display:cs.display,position:cs.position,flexDirection:cs.flexDirection,alignItems:cs.alignItems,height:cs.height,boxSizing:cs.boxSizing}; }
  return {section: box(s), freetext: box(f)};
}"""
        )
        browser.close()
        return out


if __name__ == "__main__":
    print("FASIT:", json.dumps(measure(sys.argv[1]), indent=2))
    print("AUTOGEN:", json.dumps(measure(sys.argv[2]), indent=2))
