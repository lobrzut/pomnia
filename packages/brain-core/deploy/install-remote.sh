#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Same entry as bootstrap.sh under a name landing can host as /install.sh.
# curl|sh should fetch this file or bootstrap.sh — both are POSIX sh.
set -eu
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$dir/bootstrap.sh" "$@"
