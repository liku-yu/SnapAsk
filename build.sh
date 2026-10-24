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
files = ["manifest.json", "WEB-QA.md", "PRIVACY.md", "LICENSE"]

for root in ("src", "assets"):
    for dirpath, dirnames, names in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in {".DS_Store", "__pycache__"})
        for name in sorted(names):
            if name == ".DS_Store" or name.endswith(".pyc"):
                continue
            files.append(os.path.join(dirpath, name))

missing = [path for path in files if not os.path.isfile(path)]
if missing:
    raise SystemExit("missing file(s): " + ", ".join(missing))

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in files:
        zf.write(path, path)

print("built", out)
with zipfile.ZipFile(out) as zf:
    for info in zf.infolist():
        print(f"{info.file_size:>8}  {info.filename}")
PY
