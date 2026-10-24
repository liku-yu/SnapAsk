#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/snapask-extension-v${VERSION}.zip"

rm -rf dist
mkdir -p dist

python3 - "$OUT" <<'PY'
import os
import sys
import zipfile

out = sys.argv[1]
files = [
    "manifest.json",
    "background.js",
    "offscreen.html",
    "offscreen.js",
    "ui.js",
    "content.js",
    "web-login.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "options.html",
    "options.css",
    "options.js",
    "viewer.html",
    "viewer.css",
    "viewer.js",
    "WEB-QA.md",
    "PRIVACY.md",
    "LICENSE",
]
for name in sorted(os.listdir("icons")):
    if name.endswith(".png"):
        files.append(os.path.join("icons", name))

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in files:
        if not os.path.isfile(path):
            raise SystemExit("missing file: " + path)
        zf.write(path, path)

print("built", out)
with zipfile.ZipFile(out) as zf:
    for info in zf.infolist():
        print(f"{info.file_size:>8}  {info.filename}")
PY
