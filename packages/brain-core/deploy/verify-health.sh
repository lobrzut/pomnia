#!/usr/bin/env bash
set -euo pipefail
systemctl daemon-reload
TOKEN=$(node -e 'const t=require("/var/lib/pomnia/mcp-tokens.json"); console.log(t[0].token)')
echo "=== authed healthz ==="
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7865/healthz
echo
echo "=== state dir ==="
ls -la /var/lib/pomnia/vault/state/ 2>/dev/null || echo "no state dir"
echo "=== journal ==="
journalctl -u pomnia-brain-core -n 10 --no-pager
