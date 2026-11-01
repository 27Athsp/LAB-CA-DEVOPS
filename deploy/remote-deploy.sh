#!/usr/bin/env bash
# Run ON the selected Linux host; SSH orchestration belongs to the caller.
set -Eeuo pipefail
umask 077

usage() {
  echo 'Usage: bash deploy/remote-deploy.sh frontend|api|database /absolute/role.env up|rollback|migrate|status [up|down]' >&2
  exit 2
}
[[ $# -ge 3 && $# -le 4 ]] || usage
role=$1 env_file=$2 action=$3
[[ $role =~ ^(frontend|api|database)$ && $action =~ ^(up|rollback|migrate|status)$ ]] || usage
[[ $env_file = /* && -f $env_file ]] || { echo 'Provide an existing absolute environment-file path.' >&2; exit 2; }
[[ $action != migrate || $role = api ]] || usage
[[ $# = 3 || $action = migrate ]] || usage
direction=${4:-up}
[[ $direction = up || $direction = down ]] || usage
[[ $role != database || $action != rollback ]] || { echo 'Database rollback requires a tested backup/restore procedure; image rollback is only for app roles.' >&2; exit 2; }

for dependency in docker curl python3 flock; do
  command -v "$dependency" >/dev/null || { echo "Missing required command: $dependency" >&2; exit 2; }
done
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state_dir="$(dirname -- "$env_file")/.clearcsv-$role"
mkdir -p -- "$state_dir"
exec 9>"$state_dir/lock"
flock -n 9 || { echo "Another $role deployment is running." >&2; exit 1; }
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
compose=(docker compose --project-name "clearcsv-$role" --env-file "$env_file" -f "$script_dir/compose.$role.yml")

failure() {
  echo "$role $action failed. Inspect docker compose logs on this host; output may contain application data." >&2
  if [[ -f $state_dir/current-release ]]; then
    echo 'Last verified release (image, version):' >&2
    cat "$state_dir/current-release" >&2
    echo 'Restore that explicit image/version in an environment file and run rollback. No migration is automatically reversed.' >&2
  fi
}
trap failure ERR
"${compose[@]}" config --format json >"$temporary/config.json"
metadata=$(python3 "$script_dir/verify.py" config "$role" "$temporary/config.json")
IFS=$'\t' read -r image version health_url <<<"$metadata"

if [[ $action = status ]]; then
  "${compose[@]}" ps
  exit
fi
if [[ $action = migrate ]]; then
  # Explicit release image; no server start and no migration on ordinary boot.
  migration_options=()
  migration_count=()
  if [[ $direction = down ]]; then
    [[ ${ALLOW_DB_ROLLBACK:-} = disposable ]] || { echo 'Migration down is limited to disposable demonstrations: set ALLOW_DB_ROLLBACK=disposable explicitly.' >&2; exit 2; }
    migration_options=(--env ALLOW_DB_ROLLBACK=disposable)
    migration_count=(1)
  fi
  "${compose[@]}" pull api
  "${compose[@]}" run --rm --no-deps "${migration_options[@]}" api node dist-api/migrate.js "$direction" "${migration_count[@]}"
  exit
fi

echo "Applying $role release $version ($image)"
"${compose[@]}" pull "$role"
"${compose[@]}" up -d --wait --wait-timeout 120 "$role"
if [[ $role = database ]]; then
  "${compose[@]}" exec -T database sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  verified=false
  for attempt in {1..12}; do
    if [[ $role = frontend ]]; then
      if curl --fail --silent --show-error --max-time 10 "$health_url/health" >"$temporary/health" &&
         grep -qx ok "$temporary/health" &&
         curl --fail --silent --show-error --max-time 10 "$health_url/config.json" >"$temporary/response.json" &&
         python3 "$script_dir/verify.py" check frontend "$version" "$temporary/response.json" &&
         curl --fail --silent --show-error --max-time 10 "$health_url/api-health" >"$temporary/api-health.json" &&
         python3 "$script_dir/verify.py" check api "$version" "$temporary/api-health.json"; then verified=true; break; fi
    else
      if curl --fail --silent --show-error --max-time 10 "$health_url/health" >"$temporary/response.json" &&
         python3 "$script_dir/verify.py" check api "$version" "$temporary/response.json"; then verified=true; break; fi
    fi
    sleep 2
  done
  [[ $verified = true ]] || { echo 'Release verification timed out.' >&2; false; }
fi

if [[ -f $state_dir/current-release ]]; then
  cp -- "$state_dir/current-release" "$state_dir/previous-release"
fi
printf '%s\n%s\n' "$image" "$version" >"$temporary/release"
mv -- "$temporary/release" "$state_dir/current-release"
echo "$role release $version verified."
