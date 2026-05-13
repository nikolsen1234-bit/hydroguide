"""Measure .v inside up-row."""
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
  const v = document.querySelector('.up-row .v');
  if (!v) return null;
  const rect = v.getBoundingClientRect();
  const cs = getComputedStyle(v);
  const children = Array.from(v.children).map(c => { const r=c.getBoundingClientRect(); const s=getComputedStyle(c); return {tag:c.tagName,text:c.textContent,top:r.top,h:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight}; });
  return {h:rect.height,fontSize:cs.fontSize,lineHeight:cs.lineHeight,gap:cs.gap,flexDirection:cs.flexDirection,display:cs.display,children};
}""")
        b.close()
        return out

print("FASIT",json.dumps(measure(sys.argv[1]),indent=2,ensure_ascii=False))
print("AUTOGEN",json.dumps(measure(sys.argv[2]),indent=2,ensure_ascii=False))
