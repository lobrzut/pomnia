#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Download the Linux server tarball from GitHub Releases and run install.sh.
#
# POSIX sh (Debian dash). This is the curl|sh entry — landing may later serve
# the same file as /install.sh. No bash-only constructs in here.
#
#   curl -fsSL https://raw.githubusercontent.com/lobrzut/pomnia/master/packages/brain-core/deploy/bootstrap.sh | sh
#   curl -fsSL …/bootstrap.sh | sh -s -- --with-ollama
#   POMNIA_BOOTSTRAP_DRY_RUN=1 … | sh   # download, sha256, unpack; do not sudo
#
# Override repo with POMNIA_GITHUB_REPO=owner/name (tests).
set -eu

REPO="${POMNIA_GITHUB_REPO:-lobrzut/pomnia}"
API="https://api.github.com/repos/${REPO}/releases/latest"
DRY="${POMNIA_BOOTSTRAP_DRY_RUN:-0}"

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "need $1"
}

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    die "need sha256sum, shasum, or openssl to verify the download"
  fi
}

pick_asset() {
  # Quote-split JSON; print the first https URL matching $1 (ERE).
  printf '%s\n' "$json" | tr '"' '\n' | grep '^https://' | grep -E "$1" | head -n 1
}

need curl
need tar
need gzip
need grep
need awk
need head
need tr

if [ "$DRY" != 1 ]; then
  os=$(uname -s)
  [ "$os" = Linux ] || die "this installer is for Linux (this kernel is $os)"
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) ;;
    *)
      die "GitHub packs linux-x64 only; this machine is $arch"
      ;;
  esac
  if [ ! -d /run/systemd/system ]; then
    die "systemd not found — this pack installs a unit; use the Dockerfile instead"
  fi
  command -v bash >/dev/null 2>&1 || die "bash not found (install.sh is bash; this wrapper is sh)"
  command -v node >/dev/null 2>&1 || die "node not found — install Node 20+ before running this"
  if [ "$(id -u)" -ne 0 ]; then
    command -v sudo >/dev/null 2>&1 || die "not root and sudo not found"
  fi
fi

curl_auth() {
  if [ -n "${GITHUB_TOKEN:-}${GH_TOKEN:-}" ]; then
    tok="${GITHUB_TOKEN:-$GH_TOKEN}"
    curl -fsSL -H "Authorization: Bearer $tok" -H "Accept: application/vnd.github+json" "$@"
  else
    curl -fsSL -H "Accept: application/vnd.github+json" "$@"
  fi
}

printf 'resolving latest server tarball from %s …\n' "$REPO"
json=$(curl_auth "$API") || die "could not read $API"

# linux-x64 server archive, not AppImage/deb/sha256.
tarball_url=$(pick_asset '/pomnia-brain-core-[^"]+-linux-x64\.tar\.gz$') || true
[ -n "${tarball_url:-}" ] || die "no pomnia-brain-core-*-linux-x64.tar.gz on releases/latest — tag a release that CI packed"

sum_url=$(pick_asset '/pomnia-brain-core-[^"]+-linux-x64\.tar\.gz\.sha256$') || true

work="${TMPDIR:-/tmp}/pomnia-bootstrap.$$"
mkdir "$work" || die "could not create $work"
chmod 700 "$work" 2>/dev/null || true
cleanup() { rm -rf "$work"; }
trap cleanup EXIT INT TERM

printf 'downloading %s\n' "$tarball_url"
curl -fL --retry 3 -o "$work/pkg.tar.gz" "$tarball_url" || die "download failed"

if [ -n "${sum_url:-}" ]; then
  curl_auth -o "$work/pkg.sha256" "$sum_url" || die "checksum download failed"
  expected=$(awk '{print $1}' "$work/pkg.sha256")
  actual=$(file_sha256 "$work/pkg.tar.gz")
  [ -n "$expected" ] || die "empty checksum file"
  [ "$expected" = "$actual" ] || die "sha256 mismatch (expected $expected, got $actual)"
  printf 'sha256 ok\n'
else
  printf '! no .sha256 asset on this release — skipping verify\n' >&2
fi

mkdir "$work/unpack"
# npm workspace copies can contain dangling symlinks; GNU tar on Linux creates
# them, MSYS tar on Windows aborts. Keep going if the payload we need is there.
if ! tar -xzf "$work/pkg.tar.gz" -C "$work/unpack"; then
  printf '! tar reported errors (often workspace symlinks on non-Linux)\n' >&2
fi

if [ -f "$work/unpack/pomnia-brain-core/deploy/install.sh" ]; then
  root="$work/unpack/pomnia-brain-core"
elif [ -f "$work/unpack/deploy/install.sh" ]; then
  root="$work/unpack"
else
  die "tarball did not contain deploy/install.sh"
fi

if [ "$DRY" = 1 ]; then
  trap - EXIT INT TERM
  printf 'dry-run: unpacked %s\n' "$root"
  printf 'dry-run: would run: bash %s/deploy/install.sh\n' "$root"
  ls -la "$root/deploy"
  exit 0
fi

printf '\nInstaller needs root for the systemd unit, /opt, and the pomnia system user.\n'
if [ "$(id -u)" -ne 0 ]; then
  printf 'Re-running deploy/install.sh with sudo…\n\n'
  sudo bash "$root/deploy/install.sh" "$@"
else
  bash "$root/deploy/install.sh" "$@"
fi
