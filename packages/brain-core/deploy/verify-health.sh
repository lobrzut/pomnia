#!/usr/bin/env bash
# Read the server's state. Changes nothing — the previous version ran
# `systemctl daemon-reload`, which is a strange thing for a script called
# "verify" to do to a machine you are trying to diagnose.
set -euo pipefail

UNIT=pomnia-brain-core

PORT="${BRAIN_PORT:-}"
if [[ -z "$PORT" ]]; then
  PORT=$(grep -oE -- '--port[= ]+[0-9]+' "/etc/systemd/system/${UNIT}.service" 2>/dev/null \
         | grep -oE '[0-9]+' | tail -1 || true)
fi
PORT="${PORT:-7865}"

echo "=== public healthz (no token — this is what a probe sees) ==="
curl -sS "http://127.0.0.1:${PORT}/healthz" || echo "(no answer on ${PORT})"
echo

echo "=== authed healthz (counts and per-check reasons) ==="
# The token goes in via a header file, not on the command line: arguments are
# world-readable in `ps` for as long as curl runs.
if [[ -r /var/lib/pomnia/mcp-tokens.json ]]; then
  hdr=$(mktemp) && chmod 600 "$hdr"
  trap 'rm -f "$hdr"' EXIT
  node -e 'const t=require("/var/lib/pomnia/mcp-tokens.json");process.stdout.write("Authorization: Bearer "+t[0].token+"\n")' > "$hdr"
  curl -sS -H @"$hdr" "http://127.0.0.1:${PORT}/healthz" || echo "(no answer)"
  echo
else
  echo "(cannot read /var/lib/pomnia/mcp-tokens.json — run as root or as the pomnia user)"
fi

echo "=== listening sockets ==="
# Answers the question the port confusion kept raising: what is actually bound?
ss -ltnp 2>/dev/null | grep -E ":(${PORT}|7862|7865)\b" || echo "(nothing on ${PORT}, 7862 or 7865)"

echo "=== state dir ==="
ls -la /var/lib/pomnia/vault/state/ 2>/dev/null || echo "no state dir"

echo "=== journal ==="
journalctl -u "$UNIT" -n 20 --no-pager
