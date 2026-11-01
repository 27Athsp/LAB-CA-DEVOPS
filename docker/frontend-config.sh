#!/bin/sh
set -eu
# Restrict this public value before embedding it into JSON.
case "$APP_VERSION" in
  ''|*[!a-zA-Z0-9._+-]*) echo 'APP_VERSION contains unsupported characters' >&2; exit 1 ;;
esac
[ "${#APP_VERSION}" -le 100 ] || { echo 'APP_VERSION must be at most 100 characters' >&2; exit 1; }
upstream_host=${API_UPSTREAM%:*}
upstream_port=${API_UPSTREAM##*:}
case "$upstream_host" in
  ''|*[!a-zA-Z0-9._-]*) echo 'API_UPSTREAM must be hostname:port' >&2; exit 1 ;;
esac
case "$upstream_port" in
  ''|*[!0-9]*) echo 'API_UPSTREAM must have a numeric port' >&2; exit 1 ;;
esac
[ "$upstream_host" != "$API_UPSTREAM" ] && [ "${#upstream_port}" -le 5 ] && [ "$upstream_port" -ge 1 ] && [ "$upstream_port" -le 65535 ] || { echo 'API_UPSTREAM must have a port from 1 to 65535' >&2; exit 1; }
printf '{"apiUrl":"","appVersion":"%s","historyEnabled":true}\n' "$APP_VERSION" > /usr/share/nginx/html/config.json
