#!/usr/bin/env bash
# Upgrade brain-core code on an existing install. Does NOT touch vault or tokens.
#
# The backup taken here is used. The previous version made one and then, when the
# service failed to come back, printed the journal and exited — leaving a dead
# server with its own working copy sitting untouched next door. A backup nobody
# restores is just disk usage.
set -euo pipefail

TGZ="${1:-/tmp/brain-core-upgrade.tgz}"
PREFIX=/opt/pomnia-brain-core
UNIT=pomnia-brain-core
KEEP_BACKUPS=3

[[ -f "$TGZ" ]] || { echo "missing $TGZ" >&2; exit 1; }
[[ -d "$PREFIX" ]] || { echo "missing $PREFIX" >&2; exit 1; }

# Ask the unit which port it serves rather than assuming. A probe hardcoded to
# 7865 fails an install that runs anywhere else, and then reports a healthy
# upgrade as broken.
PORT="${BRAIN_PORT:-}"
if [[ -z "$PORT" ]]; then
  PORT=$(grep -oE -- '--port[= ]+[0-9]+' "/etc/systemd/system/${UNIT}.service" 2>/dev/null \
         | grep -oE '[0-9]+' | tail -1 || true)
fi
PORT="${PORT:-7865}"
echo "probing health on port ${PORT}"

cd "$PREFIX"
stamp=$(date +%s)
backup="dist.bak.${stamp}"
cp -a dist "$backup"

restore() {
  echo "!! upgrade failed — restoring ${backup}" >&2
  rm -rf dist
  cp -a "$backup" dist
  systemctl restart "$UNIT" || true
  echo "!! restored the previous dist; service restarted from it" >&2
  journalctl -u "$UNIT" -n 40 --no-pager >&2 || true
}

tar -xzf "$TGZ"
chown -R root:root dist package.json deploy 2>/dev/null || true
# Never replace Linux-native node_modules from a Windows build artifact.
systemctl restart "$UNIT"

ok=0
for _ in $(seq 1 20); do
  sleep 0.5
  if curl -fsS -m 2 "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then ok=1; break; fi
done
if [[ "$ok" -ne 1 ]]; then
  restore
  exit 1
fi

# Keep a few generations, not every generation ever shipped.
mapfile -t old < <(ls -1dt dist.bak.* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) || true)
if ((${#old[@]})); then
  echo "pruning ${#old[@]} old backup(s): ${old[*]}"
  rm -rf -- "${old[@]}"
fi

echo "=== healthz (public) ==="
curl -sS "http://127.0.0.1:${PORT}/healthz"
echo
echo "=== package version ==="
node -p "require('${PREFIX}/package.json').version"
echo "=== service ==="
systemctl is-active "$UNIT"

# Each of these is reported, not asserted. `test -f X && echo ok` under `set -e`
# aborts the whole script when the file is missing, so a report that was meant to
# list four facts stopped after the first bad one — and the non-zero exit read as
# "the upgrade failed" when the upgrade had in fact succeeded.
report() {
  if [[ -e "$2" ]]; then echo "$1: ok"; else echo "$1: MISSING ($2)"; fi
}
report tokens /var/lib/pomnia/mcp-tokens.json
report vault /var/lib/pomnia/vault
# Marker is optional: --read-only + --vault-owner covers seeded replicas.
if [[ -f /var/lib/pomnia/vault/state/vault-writer.json ]]; then
  echo "writer marker: present"
else
  echo "writer marker: absent (fine for a pinned replica)"
fi
