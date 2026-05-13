"""Measure each up-row height."""
import sys, os, json
from playwright.sync_api import sync_playwright

def measure(path):
    url="file:///"+os.path.abspath(path).replace("\\","/")
    with sync_playwright() as p:
        b=p.chromium.launch()
        c=b.new_context(viewport={"width":794,"height":1123},device_scale_factor=2)
        pg=c.new_page()
        pg.goto(url,wait_until="networkidle")
        pg.wait_for_timeout(800)
        out=pg.evaluate("""() => {
  const rows = Array.from(document.querySelectorAll('.up-row'));
  return rows.map(r => { const rect=r.getBoundingClientRect(); const cs=getComputedStyle(r); return {top:rect.top,bottom:rect.bottom,h:rect.height,padding:cs.padding,fontSize:cs.fontSize,lineHeight:cs.lineHeight}; });
}""")
        b.close()
        return out

print("FASIT",json.dumps(measure(sys.argv[1]),indent=2))
print("AUTOGEN",json.dumps(measure(sys.argv[2]),indent=2))
