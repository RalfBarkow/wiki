#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $1" >&2
    exit 127
  }
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ok() {
  echo "OK: $*"
}

need_cmd curl
need_cmd jq

HAS_RG=0
if command -v rg >/dev/null 2>&1; then
  HAS_RG=1
fi

curl_json() {
  local url="$1"
  curl -fsS "$url"
}

curl_text() {
  local url="$1"
  curl -fsS "$url"
}

plugins_json="$(curl_json "$BASE_URL/system/plugins.json")" || fail "cannot fetch /system/plugins.json"
echo "$plugins_json" | jq -e 'type=="array"' >/dev/null || fail "/system/plugins.json not a JSON array"

echo "$plugins_json" | jq -e 'index("mech") != null' >/dev/null || fail "plugin 'mech' missing from /system/plugins.json"
ok "server registry includes 'mech'"

echo "$plugins_json" | jq -e 'index("journalmatic") != null' >/dev/null || fail "plugin 'journalmatic' missing from /system/plugins.json"
ok "server registry includes 'journalmatic'"

facts_json="$(curl_json "$BASE_URL/system/factories.json")" || fail "cannot fetch /system/factories.json"
echo "$facts_json" | jq -e 'type=="array"' >/dev/null || fail "/system/factories.json not a JSON array"

echo "$facts_json" | jq -e 'any(.[]; .name=="Mech")' >/dev/null || fail "factory 'Mech' missing from /system/factories.json"
ok "factories include 'Mech'"

echo "$facts_json" | jq -e 'any(.[]; .name=="Journalmatic")' >/dev/null || fail "factory 'Journalmatic' missing from /system/factories.json"
ok "factories include 'Journalmatic'"

curl -fsS "$BASE_URL/plugins/mech/mech.js" >/dev/null || fail "cannot fetch /plugins/mech/mech.js"
ok "served asset /plugins/mech/mech.js"

curl -fsS "$BASE_URL/plugins/journalmatic/check-page.html" >/dev/null || fail "cannot fetch /plugins/journalmatic/check-page.html"
ok "served asset /plugins/journalmatic/check-page.html"

mech_js="$(curl_text "$BASE_URL/plugins/mech/mech.js")" || fail "cannot fetch mech.js text for signature probe"
mech_blocks=""

if [ "$HAS_RG" -eq 1 ]; then
  if echo "$mech_js" | rg -q '\bEXTRACT\b' && echo "$mech_js" | rg -q '\bEDGES\b'; then
    ok "mech.js contains 'EXTRACT' and 'EDGES'"
  else
    mech_blocks="$(curl_text "$BASE_URL/plugins/mech/blocks.js")" || fail "cannot fetch blocks.js text for signature probe"
    echo "$mech_blocks" | rg -q '\bEXTRACT\b' || fail "blocks.js does not contain token 'EXTRACT' (not our mech build?)"
    echo "$mech_blocks" | rg -q '\bEDGES\b' || fail "blocks.js does not contain token 'EDGES' (not our mech build?)"
    ok "blocks.js contains 'EXTRACT' and 'EDGES'"
  fi
else
  if echo "$mech_js" | grep -Eq '(^|[^A-Za-z0-9_])EXTRACT([^A-Za-z0-9_]|$)' && \
     echo "$mech_js" | grep -Eq '(^|[^A-Za-z0-9_])EDGES([^A-Za-z0-9_]|$)'; then
    ok "mech.js contains 'EXTRACT' and 'EDGES'"
  else
    mech_blocks="$(curl_text "$BASE_URL/plugins/mech/blocks.js")" || fail "cannot fetch blocks.js text for signature probe"
    echo "$mech_blocks" | grep -Eq '(^|[^A-Za-z0-9_])EXTRACT([^A-Za-z0-9_]|$)' || fail "blocks.js does not contain token 'EXTRACT' (not our mech build?)"
    echo "$mech_blocks" | grep -Eq '(^|[^A-Za-z0-9_])EDGES([^A-Za-z0-9_]|$)' || fail "blocks.js does not contain token 'EDGES' (not our mech build?)"
    ok "blocks.js contains 'EXTRACT' and 'EDGES'"
  fi
fi

echo
ok "all localhost plugin checks passed for mech + journalmatic (and mech appears to be our EXTRACT/EDGES build)"
