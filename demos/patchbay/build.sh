#!/bin/bash
# Build index.html from src.html: inline Monaco's editor CSS (with the codicon
# font as a data URI). The page loads Monaco's JS from cdnjs; its CSS is
# inlined so the page works where only scripts may come from a CDN.
set -euo pipefail
cd "$(dirname "$0")"
VER=0.52.2
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -sSfL "https://registry.npmjs.org/monaco-editor/-/monaco-editor-$VER.tgz" | tar xz -C "$TMP"
python3 - "$TMP/package/min/vs" <<'PY'
import base64, sys
vs = sys.argv[1]
css = open(vs + "/editor/editor.main.css").read()
font = base64.b64encode(open(vs + "/base/browser/ui/codicons/codicon/codicon.ttf", "rb").read()).decode()
css = css.replace("url(../base/browser/ui/codicons/codicon/codicon.ttf)", "url(data:font/ttf;base64," + font + ")")
src = open("src.html").read()
assert src.count("/*MONACO_CSS*/") == 1
banner = "/* Monaco 0.52.2 editor.main.css (MIT), inlined */\n"
open("index.html", "w").write(src.replace("/*MONACO_CSS*/", banner + css))
PY
echo "built: $(pwd)/index.html"
