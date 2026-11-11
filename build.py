#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file.

    python3 build.py            -> dist/elevate-auto-sales.html

The bundle inlines css/styles.css, every js/*.js file referenced by
index.html, and data/inventory.json, so it opens with a double-click and can
be shared or hosted as a single file. Local images that js/config.js points
to (like assets/hero-photo.jpg) are embedded too. Blocks wrapped in
<!-- build:remove --> ... <!-- /build:remove --> are dropped (they point at
local asset files that don't exist inside a single-file bundle).
"""
import base64
import json
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dist" / "elevate-auto-sales.html"


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    html = re.sub(r"\s*<!-- build:remove -->.*?<!-- /build:remove -->", "", html, flags=re.S)

    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/styles.css">', f"<style>\n{css}\n</style>")

    data = json.loads((ROOT / "data" / "inventory.json").read_text(encoding="utf-8"))
    embedded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    data_tag = f'<script type="application/json" id="inventory-data">{embedded}</script>'

    def embed_local_images(code: str) -> str:
        # 'assets/photo.jpg' -> data URI, so the single file works on its own.
        def to_data_uri(m: re.Match) -> str:
            path = ROOT / m.group(1)
            if not path.is_file() or path.stat().st_size > 3_000_000:
                return m.group(0)
            mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
            return "'data:%s;base64,%s'" % (mime, base64.b64encode(path.read_bytes()).decode("ascii"))
        return re.sub(r"'(assets/[^']+\.(?:jpe?g|png|webp))'", to_data_uri, code)

    def inline_script(match: re.Match) -> str:
        src = match.group(1)
        code = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
        if src == "js/config.js":
            code = embed_local_images(code)
        return f"<script>\n{code}\n</script>"

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_script, html)
    # Embedded inventory must exist before inventory-source.js runs.
    html = html.replace("<div id=\"shell-bottom\"></div>", f"<div id=\"shell-bottom\"></div>\n  {data_tag}", 1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
