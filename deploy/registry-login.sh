#!/usr/bin/env bash
set -euo pipefail
[[ $# = 2 && -f $2 ]] || { echo 'Usage: bash deploy/registry-login.sh GHCR_USERNAME /protected/token-file' >&2; exit 2; }
# The token is read from standard input and is never an argument or log line.
docker login ghcr.io --username "$1" --password-stdin < "$2"
