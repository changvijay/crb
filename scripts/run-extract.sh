#!/bin/sh
# Re-generates every guide fragment from the legacy HTML (read-only source). Usage: scripts/run-extract.sh [slug...]
set -e
LEGACY="${LEGACY:-/Users/changvijay/Desktop/ChangMarketReport/public}"
cd "$(dirname "$0")/.."
python3 - "$LEGACY" "$@" <<'PY'
import json, subprocess, sys
legacy, only = sys.argv[1], sys.argv[2:]
cfgs = json.load(open("scripts/guides.json"))
for slug, cfg in cfgs.items():
    if only and slug not in only: continue
    src = cfg.pop("src")
    subprocess.run([sys.executable, "scripts/extract-guide.py", f"{legacy}/{src}", slug, json.dumps(cfg)], check=True)
PY
