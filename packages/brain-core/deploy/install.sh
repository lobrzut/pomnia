#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Install Pomnia brain-core as a systemd service.
#
# Idempotent: safe to re-run to upgrade an existing install. It never touches
# the vault, never overwrites tokens, and refuses rather than guesses.
#
#   sudo ./install.sh                      # install or upgrade (fastembed, no Ollama)
#   sudo ./install.sh --port 7865
#   sudo ./install.sh --vault-root /mnt/vault
#   sudo ./install.sh --embed-backend ollama --with-ollama
#
# Default embed backend is fastembed (in-process ONNX ~0.5 GB). Ollama is
# optional for hosts that already run it; chat/distill models are never pulled.
set -euo pipefail

PREFIX=/opt/pomnia-brain-core
DATA=/var/lib/pomnia
VAULT_ROOT=""
USER_NAME=pomnia
PORT=7865
EMBED_BACKEND=fastembed
UNIT=/etc/systemd/system/pomnia-brain-core.service
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --data-dir) DATA="$2"; shift 2 ;;
    --vault-root) VAULT_ROOT="$2"; shift 2 ;;
    --embed-backend) EMBED_BACKEND="$2"; shift 2 ;;
    # Consent up front, for a run with no terminal attached. There is no
    # --no-ollama: doing nothing is already the default when nobody says yes.
    --with-ollama) WITH_OLLAMA=1; EMBED_BACKEND=ollama; shift ;;
    -h|--help) sed -n '3,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

die() { echo "✗ $*" >&2; exit 2; }
ok()  { echo "✔ $*"; }

[[ $EUID -eq 0 ]] || die "run as root (systemd unit + system user)"
command -v node >/dev/null || die "node not found — install Node 22 first (tarball native addons match CI Node 22)"
command -v systemctl >/dev/null || die "systemd not found; use the Dockerfile instead"

case "$EMBED_BACKEND" in
  fastembed|ollama) ;;
  *) die "unknown --embed-backend $EMBED_BACKEND (use fastembed or ollama)" ;;
esac

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ "$NODE_MAJOR" -ge 22 ]] || die "node $NODE_MAJOR is too old — the packed better-sqlite3 is Node 22 (ABI 127); 20 crashes on start"

# The build has to exist. Shipping a unit that points at nothing produces a
# service that fails five seconds after a successful-looking install.
[[ -f "$SRC/dist/daemon.js" ]] || die "no build at $SRC/dist — run 'npm run build' in packages/brain-core first"

id -u "$USER_NAME" >/dev/null 2>&1 || {
  useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin "$USER_NAME"
  ok "created system user $USER_NAME"
}

VAULT_ROOT="${VAULT_ROOT:-$DATA/vault}"

install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$DATA" "$DATA/vault" "$DATA/vectordb" "$DATA/embed-cache"
# Vault may live on its own mount; create the target when it is still local.
if [[ ! -d "$VAULT_ROOT" ]]; then
  install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$VAULT_ROOT"
fi
mkdir -p "$PREFIX"
# Copy rather than symlink: ProtectSystem=strict + a symlink into someone's
# home directory is a failure that reads as "node not found".
cp -r "$SRC/dist" "$SRC/package.json" "$PREFIX/"
[[ -d "$SRC/node_modules" ]] && cp -r "$SRC/node_modules" "$PREFIX/"
chown -R root:root "$PREFIX"
ok "installed to $PREFIX"

# Tokens: generate one on first install, never regenerate. Rotating a token on
# every upgrade would silently disconnect every agent that was working.
TOKENS="$DATA/mcp-tokens.json"
if [[ ! -f "$TOKENS" ]]; then
  TOKEN="btk_$(head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 32)"
  printf '[{"name":"first","token":"%s","created":"%s"}]\n' \
    "$TOKEN" "$(date -Is)" > "$TOKENS"
  chown "$USER_NAME:$USER_NAME" "$TOKENS"
  chmod 600 "$TOKENS"
  ok "generated the first token (chmod 600, $TOKENS)"
  NEW_TOKEN="$TOKEN"
else
  ok "kept the existing tokens file — upgrade does not rotate credentials"
fi

# First panel account. Random, printed once, never chosen by a human and never
# passed as an argument — an argument lands in shell history and in `ps` output
# for every user on the box. `admin/changeme` is the failure mode this avoids:
# a default that is meant to be changed is a default that stays.
USERS="$DATA/users.json"
if [[ ! -f "$USERS" ]]; then
  ADMIN_PW="$(head -c 18 /dev/urandom | base64 | tr -d '+/=' | head -c 24)"
  if printf '%s\n' "$ADMIN_PW" | sudo -u "$USER_NAME" node "$PREFIX/dist/daemon.js" \
       --data-dir "$DATA" --add-user admin --role admin >/dev/null 2>&1; then
    ok "created the panel account 'admin'"
    NEW_USER=1
    # Write before healthz: if the unit fails to listen, the operator still
    # has the password (users.json is already created; stdout must not hold it).
    PASSFILE="$DATA/admin-initial-password"
    printf '%s\n' "$ADMIN_PW" > "$PASSFILE"
    chown "$USER_NAME:$USER_NAME" "$PASSFILE"
    chmod 600 "$PASSFILE"
  else
    echo "! could not create the first account — do it yourself:" >&2
    echo "    sudo -u $USER_NAME node $PREFIX/dist/daemon.js --data-dir $DATA --add-user <login> --role admin" >&2
  fi
else
  ok "kept the existing accounts — upgrade does not reset passwords"
fi

# Prefetch ONNX weights before starting the unit so first /healthz is not a
# multi-minute download under ProtectSystem=strict.
if [[ "$EMBED_BACKEND" == "fastembed" ]]; then
  echo "  prefetching nomic-embed ONNX (~0.5 GB) into $DATA/embed-cache…"
  if sudo -u "$USER_NAME" env \
       BRAIN_EMBED_BACKEND=fastembed \
       BRAIN_EMBED_CACHE="$DATA/embed-cache" \
       node "$PREFIX/dist/daemon.js" \
         --data-dir "$DATA" \
         --embed-backend fastembed \
         --embed-cache "$DATA/embed-cache" \
         --prefetch-embed; then
    ok "embed cache ready"
  else
    echo "! prefetch failed — first search will download the model (needs network)" >&2
  fi
fi

sed -e "s|--port 7865|--port $PORT|" \
    -e "s|/opt/pomnia-brain-core|$PREFIX|g" \
    -e "s|/var/lib/pomnia/vault|$VAULT_ROOT|g" \
    -e "s|/var/lib/pomnia|$DATA|g" \
    -e "s|BRAIN_EMBED_BACKEND=fastembed|BRAIN_EMBED_BACKEND=$EMBED_BACKEND|" \
    "$SRC/deploy/pomnia-brain-core.service" > "$UNIT"

# ProtectSystem=strict only allows writes under ReadWritePaths. A vault on its
# own mount (outside $DATA) must be listed, and RequiresMountsFor= stops the
# unit from claiming an empty pre-mount directory as the real vault.
DATA_REAL=$(realpath -m "$DATA")
VAULT_REAL=$(realpath -m "$VAULT_ROOT")
case "$VAULT_REAL" in
  "$DATA_REAL"|"$DATA_REAL"/*) ;;
  *)
    {
      echo "RequiresMountsFor=$VAULT_REAL"
      echo "ReadWritePaths=$VAULT_REAL"
    } >> "$UNIT"
    ok "extended unit for vault mount $VAULT_REAL"
    ;;
esac

systemctl daemon-reload
ok "unit written to $UNIT"

systemctl enable pomnia-brain-core >/dev/null
systemctl restart pomnia-brain-core

# Verify rather than announce. An installer that prints "done" over a service
# that died two seconds ago is the whole failure mode this project keeps
# hitting, and it is trivial to avoid here.
# First fastembed load can take longer than a cold Ollama ping.
for _ in $(seq 1 60); do
  sleep 0.5
  if curl -fsS -m 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
done

HEALTH=$(curl -sS -m 3 "http://127.0.0.1:$PORT/healthz" 2>/dev/null || true)
if [[ -z "$HEALTH" ]]; then
  echo
  echo "✗ the service is not answering on port $PORT"
  echo "  systemctl status pomnia-brain-core --no-pager"
  echo "  journalctl -u pomnia-brain-core -n 40 --no-pager"
  exit 1
fi

STATUS=$(printf '%s' "$HEALTH" | grep -o '"status":"[a-z]*"' | cut -d'"' -f4)
EMBED_READY=$(printf '%s' "$HEALTH" | sed -n 's/.*"ready":\(true\|false\).*/\1/p' | head -1)
EMBED_BE=$(printf '%s' "$HEALTH" | sed -n 's/.*"backend":"\([a-z]*\)".*/\1/p' | head -1)
HOST_IP="$(hostname -I | awk '{print $1}')"
echo
echo "  Pomnia brain-core  →  http://$HOST_IP:$PORT"
echo "  panel              →  http://$HOST_IP:$PORT/admin"
echo "  status             →  ${STATUS:-unknown}"
echo "  embed backend      →  ${EMBED_BE:-$EMBED_BACKEND} (ready=${EMBED_READY:-?})"
[[ -n "${NEW_TOKEN:-}" ]] && echo "  agent token        →  $NEW_TOKEN"
if [[ -n "${NEW_USER:-}" ]]; then
  echo
  echo "  panel login        →  admin"
  echo "  panel password     →  written once to ${PASSFILE:-$DATA/admin-initial-password} (chmod 600; delete after login)"
  echo "  Change it after the first login (Konta → Hasło)."
fi
echo

# The embedder decides whether anything else is worth suggesting, so read it
# directly instead of inferring from the overall verdict.
OLLAMA_STATE=$(printf '%s' "$HEALTH" | sed -n 's/.*"ollama":{"state":"\([a-z]*\)".*/\1/p')
# Empty index over an empty vault is degraded, not down: there is nothing to
# index yet. Only the index state separates "push me a vault" from "reindex".
INDEX_STATE=$(printf '%s' "$HEALTH" | sed -n 's/.*"index":{"state":"\([a-z]*\)".*/\1/p')

EMBED_MODEL=nomic-embed-text

offer_ollama() {
  local answer=""
  if [[ "${WITH_OLLAMA:-0}" == "1" ]]; then
    answer=y
  else
    local tty=""
    if [[ -t 0 ]]; then
      tty=/dev/stdin
    elif [[ -r /dev/tty ]]; then
      tty=/dev/tty
    fi
    if [[ -n "$tty" ]]; then
      echo "  Ollama is not answering, so nothing can be embedded — search will find"
      echo "  nothing until it is."
      echo
      printf "  Install Ollama now and pull %s (~275 MB)? [y/N] " "$EMBED_MODEL"
      read -r answer < "$tty" || true
    fi
  fi

  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo
    echo "  Left alone. Prefer the default KVM path (no Ollama):"
    echo "      sudo ./install.sh --embed-backend fastembed"
    echo "  or point at an Ollama you already run, and restart:"
    echo "      Environment=BRAIN_EMBED_BACKEND=ollama"
    echo "      --ollama-url http://<host>:11434     (in $UNIT)"
    echo
    echo "  The server serves without it: skills, the profile and saved notes all"
    echo "  work. Only meaning-based search is off."
    return
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    echo "  installing Ollama…"
    curl -fsSL https://ollama.com/install.sh | sh || {
      echo "! Ollama install failed — do it yourself, then: ollama pull $EMBED_MODEL" >&2
      return
    }
  fi

  echo "  pulling $EMBED_MODEL…"
  ollama pull "$EMBED_MODEL" || {
    echo "! pull failed — retry with: ollama pull $EMBED_MODEL" >&2
    return
  }

  systemctl restart pomnia-brain-core
  for _ in $(seq 1 20); do
    sleep 0.5
    NEW=$(curl -sS -m 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null || true)
    STATE=$(printf '%s' "$NEW" | sed -n 's/.*"ollama":{"state":"\([a-z]*\)".*/\1/p')
    if [[ "$STATE" == "ok" ]]; then
      HEALTH="$NEW"
      STATUS=$(printf '%s' "$NEW" | grep -o '"status":"[a-z]*"' | cut -d'"' -f4)
      OLLAMA_STATE=ok
      ok "Ollama answering — embeddings ready"
      return
    fi
  done
  echo "! Ollama installed but the server still cannot reach it." >&2
  echo "  journalctl -u pomnia-brain-core -n 30 --no-pager" >&2
}

# Only offer Ollama when that backend was chosen and it is not ready.
if [[ "$EMBED_BACKEND" == "ollama" && -n "$OLLAMA_STATE" && "$OLLAMA_STATE" != "ok" ]]; then
  offer_ollama
  echo
fi

case "$STATUS" in
  ok) ok "serving" ;;
  degraded)
    if [[ "${INDEX_STATE:-}" == "degraded" ]]; then
      echo "  Serving, with an empty vault — nothing to search yet."
      echo "  Push one from Pomnia Desktop (Connect → push changes),"
      echo "  or put notes in $VAULT_ROOT and build the index:"
      echo "      sudo -u $USER_NAME node $PREFIX/dist/daemon.js --data-dir $DATA --vault-root $VAULT_ROOT --reindex"
    else
      echo "  Degraded — it serves, but not everything it should. See /admin → Stan."
    fi
    if [[ "${EMBED_READY:-false}" != "true" ]]; then
      echo "  Embedder not ready — check journalctl -u pomnia-brain-core"
    fi
    ;;
  *)
    if [[ "${EMBED_READY:-false}" == "true" || "$OLLAMA_STATE" == "ok" ]]; then
      echo "  Not serving yet. The index is empty until you build it:"
      echo "      sudo -u $USER_NAME node $PREFIX/dist/daemon.js --data-dir $DATA --vault-root $VAULT_ROOT --reindex"
      echo "  Or push a vault from Pomnia Desktop (Connect → push changes)."
    else
      echo "  Not serving yet — fix the embedder above, then build the index."
    fi
    ;;
esac
