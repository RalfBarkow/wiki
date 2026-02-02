#!/usr/bin/env bash
set -euo pipefail

MECH_GIT="${MECH_GIT:-git+https://github.com/ralfbarkow/wiki-plugin-mech.git#4b8051417dec6b0eff40878290a703b1fa60fb52}"
ALLOW_FILE_MECH="${ALLOW_FILE_MECH:-0}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $1" >&2
    exit 127
  }
}

need_cmd jq
need_cmd npm

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

if [ ! -f package.json ]; then
  echo "ERROR: package.json not found in $root_dir" >&2
  exit 1
fi

echo "Setting wiki-plugin-mech to: $MECH_GIT"

if [[ "$MECH_GIT" == file:* ]] && [[ "$ALLOW_FILE_MECH" != "1" ]]; then
  echo "ERROR: MECH_GIT uses file: which breaks Nix/npmDepsHash reproducibility." >&2
  echo "Use the default git tag or set ALLOW_FILE_MECH=1 explicitly for local injection." >&2
  exit 1
fi

jq --arg mech "$MECH_GIT" '
  .dependencies = (if (.dependencies | type) == "object" then .dependencies else {} end)
  | .optionalDependencies = (if (.optionalDependencies | type) == "object" then .optionalDependencies else {} end)
  | del(.dependencies["wiki-plugin-mech"])
  | .optionalDependencies["wiki-plugin-mech"] = $mech
' package.json > package.json.tmp
mv package.json.tmp package.json

if [ -f .envrc ]; then
  echo "NOTE: .envrc detected. If direnv blocks updates, run: direnv allow" >&2
fi

if [ -f package-lock.json ]; then
  npm install
else
  npm install
fi

# Normalize git+ssh URLs to git+https for Nix sandbox compatibility.
if [ -f package-lock.json ]; then
  node <<'NODE'
const fs = require('fs');
const path = require('path');
const lockPath = path.join(process.cwd(), 'package-lock.json');
let data = fs.readFileSync(lockPath, 'utf8');
data = data
  .replace(/git\+ssh:\/\/git@github\.com\//g, 'git+https://github.com/')
  .replace(/ssh:\/\/git@github\.com\//g, 'https://github.com/');
fs.writeFileSync(lockPath, data);
NODE
fi

echo -n "Resolved mech version: "
node -p "require('wiki-plugin-mech/package.json').version"

if node -e "const p=require('wiki-plugin-mech/package.json'); process.exit(p.gitHead?0:1)"; then
  echo -n "Resolved gitHead: "
  node -p "require('wiki-plugin-mech/package.json').gitHead"
fi

if node -e "const p=require('wiki-plugin-mech/package.json'); process.exit(p._resolved?0:1)"; then
  echo -n "Resolved _resolved: "
  node -p "require('wiki-plugin-mech/package.json')._resolved"
fi
