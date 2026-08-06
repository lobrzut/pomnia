#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Back up the small files that cannot be rebuilt.
#
# Almost everything a Pomnia server holds is recoverable: the vault is a
# replica of the desktop's, and the index is one `--reindex` away. Four files
# are not, and together they are under 10 kB:
#
#   mcp-tokens.json      lose it and every agent loses access at once
#   users.json           lose it and nobody can sign in to the panel
#   server-settings.json the Ollama address and model chosen from the panel
#   instance-id          the identity this instance claims the vault under —
#                        a new one makes the server a stranger to its own vault
#
# What this covers: a deletion, a bad edit, an upgrade that went sideways.
# What it does NOT cover: losing the disk. It writes to the same filesystem,
# because there is no other one here — no network mount, one drive. Copy the
# directory off the box for that:
#
#   scp -r root@server:/var/lib/pomnia/backup ~/pomnia-backup
set -euo pipefail

DATA="${1:-/var/lib/pomnia}"
DEST="$DATA/backup"
KEEP_DAYS=14
STAMP="$(date +%Y-%m-%d)"
OUT="$DEST/$STAMP"

FILES=(mcp-tokens.json users.json server-settings.json instance-id)

mkdir -p "$OUT"
chmod 700 "$DEST" "$OUT"

copied=0
missing=()
for f in "${FILES[@]}"; do
  if [[ -f "$DATA/$f" ]]; then
    # Preserve mode and owner: a token file restored world-readable has been
    # readable for as long as it took someone to notice.
    cp -p "$DATA/$f" "$OUT/$f"
    copied=$((copied + 1))
  else
    missing+=("$f")
  fi
done

# server-settings.json only exists once someone changes something in the panel,
# so its absence is normal and must not read as a failure.
if [[ $copied -eq 0 ]]; then
  echo "pomnia-backup: nothing to back up in $DATA — is the path right?" >&2
  exit 1
fi

# Prune by age, not by count: a server that was off for a month should not have
# its only surviving copy rotated away by fourteen runs on the day it returns.
find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

kept="$(find "$DEST" -mindepth 1 -maxdepth 1 -type d | wc -l)"
echo "pomnia-backup: $copied file(s) → $OUT ($kept daily copies kept)${missing[*]+, absent: ${missing[*]}}"
