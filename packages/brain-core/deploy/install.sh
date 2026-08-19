#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Install Pomnia brain-core as a systemd service.
#
# Idempotent: safe to re-run to upgrade an existing install. It never touches
# the vault, never overwrites tokens, and refuses rather than guesses.
#
#   sudo ./install.sh                 # install or upgrade
#   sudo ./install.sh --port 7865     # non-default port
#   sudo ./install.sh --with-ollama   # say yes up front (unattended runs)
#
# It offers to install Ollama and pull the embedding model, and only with a yes.
# Everything else stays hands-off on purpose: firewall ports and TLS are
# decisions about someone else's machine, and guessing them is how an installer
# becomes something people read before they run.
set -euo pipefail

PREFIX=/opt/pomnia-brain-core
DATA=/var/lib/pomnia
USER_NAME=pomnia
PORT=7865
UNIT=/etc/systemd/system/pomnia-brain-core.service
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --data-dir) DATA="$2"; shift 2 ;;
    # Consent up front, for a run with no terminal attached. There is no
    # --no-ollama: doing nothing is already the default when nobody says yes.
    --with-ollama) WITH_OLLAMA=1; shift ;;
    -h|--help) sed -n '3,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

die() { echo "✗ $*" >&2; exit 1; }
ok()  { echo "✔ $*"; }

[[ $EUID -eq 0 ]] || die "run as root (systemd unit + system user)"
command -v node >/dev/null || die "node not found — install Node 20+ first"
command -v systemctl >/dev/null || die "systemd not found; use the Dockerfile instead"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ "$NODE_MAJOR" -ge 20 ]] || die "node $NODE_MAJOR is too old — brain-core needs 20+"

# The build has to exist. Shipping a unit that points at nothing produces a
# service that fails five seconds after a successful-looking install.
[[ -f "$SRC/dist/daemon.js" ]] || die "no build at $SRC/dist — run 'npm run build' in packages/brain-core first"

id -u "$USER_NAME" >/dev/null 2>&1 || {
  useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin "$USER_NAME"
  ok "created system user $USER_NAME"
}

install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$DATA" "$DATA/vault" "$DATA/vectordb"
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
  else
    echo "! could not create the first account — do it yourself:" >&2
    echo "    sudo -u $USER_NAME node $PREFIX/dist/daemon.js --data-dir $DATA --add-user <login> --role admin" >&2
  fi
else
  ok "kept the existing accounts — upgrade does not reset passwords"
fi

sed -e "s|--port 7865|--port $PORT|" \
    -e "s|/opt/pomnia-brain-core|$PREFIX|g" \
    -e "s|/var/lib/pomnia|$DATA|g" \
    "$SRC/deploy/pomnia-brain-core.service" > "$UNIT"
systemctl daemon-reload
ok "unit written to $UNIT"

systemctl enable pomnia-brain-core >/dev/null
systemctl restart pomnia-brain-core

# Verify rather than announce. An installer that prints "done" over a service
# that died two seconds ago is the whole failure mode this project keeps
# hitting, and it is trivial to avoid here.
for _ in $(seq 1 20); do
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
HOST_IP="$(hostname -I | awk '{print $1}')"
echo
echo "  Pomnia brain-core  →  http://$HOST_IP:$PORT"
echo "  panel              →  http://$HOST_IP:$PORT/admin"
echo "  status             →  ${STATUS:-unknown}"
[[ -n "${NEW_TOKEN:-}" ]] && echo "  agent token        →  $NEW_TOKEN"
if [[ -n "${NEW_USER:-}" ]]; then
  # Never echo the password to stdout (logs, scrollback, shared tmux). Write once
  # to a 600 file the operator can read and delete after first login.
  PASSFILE="$DATA/admin-initial-password"
  printf '%s\n' "$ADMIN_PW" > "$PASSFILE"
  chown "$USER_NAME:$USER_NAME" "$PASSFILE"
  chmod 600 "$PASSFILE"
  echo
  echo "  panel login        →  admin"
  echo "  panel password     →  written once to $PASSFILE (chmod 600; delete after login)"
  echo "  Change it after the first login (Konta → Hasło)."
fi
echo

# The embedder decides whether anything else is worth suggesting, so read it
# directly instead of inferring from the overall verdict.
#
# A fresh install on a machine without Ollama lands on "down" — the index is
# empty, which is true — and the old message told the operator to run --reindex.
# That refuses without an embedding model, by design, so the advice sent them
# into a wall and never named the thing in the way. Semantic search is the point
# of this server; say what it is missing first, whatever the summary says.
OLLAMA_STATE=$(printf '%s' "$HEALTH" | sed -n 's/.*"ollama":{"state":"\([a-z]*\)".*/\1/p')

EMBED_MODEL=nomic-embed-text

# Offer, then do it. Reading two commands off a screen and pasting them back is
# not a decision anybody is making thoughtfully — it is the same install, with a
# gap in it where people give up. Consent stays explicit: a prompt when someone
# is watching, --with-ollama when nobody is, and nothing at all otherwise.
offer_ollama() {
  local answer=""
  if [[ "${WITH_OLLAMA:-0}" == "1" ]]; then
    answer=y
  else
    # curl|sh leaves stdin as the script pipe, so [[ -t 0 ]] is false and the
    # old branch skipped the question (everyone got "Left alone"). Ask on the
    # controlling terminal when there is one.
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
    echo "  Left alone. When you want search, either on this host:"
    echo "      curl -fsSL https://ollama.com/install.sh | sh && ollama pull $EMBED_MODEL"
    echo "  or point at one you already run, and restart:"
    echo "      --ollama-url http://<host>:11434     (in $UNIT)"
    echo
    echo "  The server serves without it: skills, the profile and saved notes all"
    echo "  work. Only meaning-based search is off."
    return
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    echo "  installing Ollama…"
    # Their installer, run as themselves — not vendored, not mirrored. Pinning a
    # copy here would mean shipping someone else's install script and owning its
    # bugs on distributions nobody here has tested.
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

  # Verify rather than announce, same rule as the rest of this script: the
  # question is whether the server can embed now, not whether a command exited 0.
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

if [[ -n "$OLLAMA_STATE" && "$OLLAMA_STATE" != "ok" ]]; then
  offer_ollama
  echo
fi

case "$STATUS" in
  ok) ok "serving" ;;
  degraded)
    echo "  Degraded — it serves, but not everything it should. See /admin → Stan."
    ;;
  *)
    if [[ "$OLLAMA_STATE" == "ok" ]]; then
      echo "  Not serving yet. The index is empty until you build it:"
      echo "      sudo -u $USER_NAME node $PREFIX/dist/daemon.js --data-dir $DATA --vault-root $DATA/vault --reindex"
      echo "  Or push a vault from Pomnia Desktop (Connect → push changes)."
    else
      echo "  Not serving yet — start with Ollama above, then build the index."
    fi
    ;;
esac
