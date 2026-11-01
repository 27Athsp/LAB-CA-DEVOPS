#!/usr/bin/env bash
# Mocked state-transition check. Never contacts Docker, a registry, or hosts.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
mkdir "$temporary/bin"
export MOCK_LOG="$temporary/docker.log"
cat >"$temporary/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$MOCK_LOG"
action=other
while (($#)); do
  case $1 in
    --env-file) env_file=$2; shift ;;
    config) action=config ;;
  esac
  shift
done
if [[ $action = config ]]; then
  python3 - "$env_file" <<'PY'
import json, sys
with open(sys.argv[1]) as handle:
    env = dict(line.strip().split('=', 1) for line in handle if '=' in line)
print(json.dumps({'services': {'api': {
    'image': env['API_IMAGE'], 'environment': {'APP_VERSION': env['APP_VERSION']},
    'ports': [{'host_ip': '127.0.0.1', 'published': '3000'}],
}}}))
PY
fi
MOCK
cat >"$temporary/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf '{"status":"ok","version":"%s"}\n' "$MOCK_VERSION"
MOCK
# Locking and real wait time are outside this isolated state-transition check.
printf '#!/usr/bin/env bash\nexit 0\n' >"$temporary/bin/flock"
cp "$temporary/bin/flock" "$temporary/bin/sleep"
chmod +x "$temporary/bin/"*
export PATH="$temporary/bin:$PATH"
for version in v1.0.0 v2.0.0; do
  printf 'API_IMAGE=ghcr.io/example/clearcsv-api:%s\nAPP_VERSION=%s\n' "$version" "$version" >"$temporary/$version.env"
done

MOCK_VERSION=v1.0.0 bash "$script_dir/remote-deploy.sh" api "$temporary/v1.0.0.env" up
if MOCK_VERSION=v1.0.0 bash "$script_dir/remote-deploy.sh" api "$temporary/v2.0.0.env" up >"$temporary/failed.log" 2>&1; then
  echo 'A release returning the wrong version unexpectedly passed.' >&2; exit 1
fi
grep -qx v1.0.0 "$temporary/.clearcsv-api/current-release"
MOCK_VERSION=v2.0.0 bash "$script_dir/remote-deploy.sh" api "$temporary/v2.0.0.env" up
MOCK_VERSION=v1.0.0 bash "$script_dir/remote-deploy.sh" api "$temporary/v1.0.0.env" rollback
grep -qx v1.0.0 "$temporary/.clearcsv-api/current-release"
grep -qx v2.0.0 "$temporary/.clearcsv-api/previous-release"
if bash "$script_dir/remote-deploy.sh" api "$temporary/v1.0.0.env" migrate down >"$temporary/down.log" 2>&1; then
  echo 'An unguarded down migration unexpectedly passed.' >&2; exit 1
fi
ALLOW_DB_ROLLBACK=disposable bash "$script_dir/remote-deploy.sh" api "$temporary/v1.0.0.env" migrate down
grep -q 'run --rm --no-deps --env ALLOW_DB_ROLLBACK=disposable api node dist-api/migrate.js down 1' "$MOCK_LOG"
[[ $(grep -c 'dist-api/migrate.js' "$MOCK_LOG") = 1 ]]
echo 'Mocked deployment state, explicit rollback, and migration guard checks passed.'
