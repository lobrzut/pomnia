#!/usr/bin/env bash
# Upgrade brain-core code on an existing install. Does NOT touch vault or tokens.
set -euo pipefail
TGZ="${1:-/tmp/brain-core-upgrade.tgz}"
PREFIX=/opt/pomnia-brain-core
[[ -f "$TGZ" ]] || { echo "missing $TGZ" >&2; exit 1; }
[[ -d "$PREFIX" ]] || { echo "missing $PREFIX" >&2; exit 1; }

cd "$PREFIX"
stamp=$(date +%s)
cp -a dist "dist.bak.${stamp}"
tar -xzf "$TGZ"
chown -R root:root dist package.json deploy 2>/dev/null || true
# Never replace Linux-native node_modules from a Windows build artifact.
systemctl restart pomnia-brain-core

ok=0
for _ in $(seq 1 20); do
  sleep 0.5
  if curl -fsS -m 2 http://127.0.0.1:7865/healthz >/dev/null 2>&1; then ok=1; break; fi
done
[[ "$ok" -eq 1 ]] || { journalctl -u pomnia-brain-core -n 40 --no-pager; exit 1; }

echo "=== healthz (public) ==="
curl -sS http://127.0.0.1:7865/healthz
echo
echo "=== package version ==="
node -p "require('${PREFIX}/package.json').version"
echo "=== service ==="
systemctl is-active pomnia-brain-core
test -f /var/lib/pomnia/mcp-tokens.json && echo tokens_ok
test -d /var/lib/pomnia/vault && echo vault_ok
# Marker is optional: --read-only + --vault-owner covers seeded replicas.
if [[ -f /var/lib/pomnia/vault/state/vault-writer.json ]]; then
  echo writer_marker_ok
else
  echo writer_marker_absent_ok
fi
