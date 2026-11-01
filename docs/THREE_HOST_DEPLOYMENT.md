# Three Linux hosts, three independently replaceable services

Use three separate Linux machines with Docker Engine, Docker Compose v2.20+,
Bash, curl, Python 3 and `flock` (util-linux). This directory does not SSH to any
machine. Each command below runs **on the named host**, from a copy of this
repository containing `deploy/`. CI may invoke the same commands through SSH
after verifying the host key. Keep the same checkout path and environment-file
directory between releases.

| Host | Service | Container port | Incoming access |
| --- | --- | --- | --- |
| Frontend | Nginx, static UI, same-origin API proxy | 8080 | TLS reverse proxy or trusted VPN clients |
| API | Node API | 3000 | Frontend host over the private network |
| Database | PostgreSQL 17.6 | 5432 | API host over the private network |

Configure DNS or VPN hostnames yourself. Examples contain placeholders, never
working addresses or credentials. All host bindings default to `127.0.0.1`;
change API and database bindings to their respective VPN/private interface
addresses before cross-host deployment. `API_UPSTREAM` is the API host's private
`hostname:port`, without `http://`, as reached **by Nginx**, not the browser. Docker bridge networks and
Compose service names do not connect separate machines.

## Establish the trust boundary first

Use a trusted encrypted VPN between the three machines, or configure verified
TLS on each cross-host hop before allowing traffic. This example uses a VPN for
API and PostgreSQL traffic and HTTPS at the frontend's reverse proxy. The
database container has its own local Docker network, but publishing port 5432
still requires access controls on the host/network.

Restrict 3000 to the frontend's private source address and 5432 to the API's private
source address. Only expose the frontend HTTPS endpoint to authorized users.
Apply network/security-group rules and Docker-aware firewall rules (for example,
the `DOCKER-USER` chain); Docker-published ports can bypass ordinary UFW rules.
Test from an unauthorized machine that both backend ports are unreachable.
Do not bind API/database to all interfaces to make a connectivity error disappear.

The shared history API has no per-user authentication or authorization. This is
a classroom deployment for trusted users: protect the frontend with your TLS
gateway's authentication and restrict direct API access. CORS accepts one exact
frontend origin, but CORS is not authentication and cannot stop direct API clients.
Do not store sensitive CSV content or expose this service as an unrestricted
public application. Only metadata, not CSV rows, belongs in the shared history.

## Host configuration and secrets

On each host, copy the matching `deploy/*.env.example` to an absolute path such
as `/etc/clearcsv/frontend.env`, `/etc/clearcsv/api.env` or
`/etc/clearcsv/database.env`. Replace every placeholder. Restrict the containing
directory and env file to the deployment operator. Keep these files outside Git.
The env files use ordinary Compose dotenv syntax; they are never shell-sourced.
Unset stale exported Compose variables when using them: shell variables take
precedence over env files, and the script validates the resulting configuration.

Create `/etc/clearcsv/secrets/postgres-password` on both API and database hosts
using your secret-management tool or an interactive editor; the two files must
contain the same strong password. Never pass the password as a command argument,
put it into an image, print it, or commit it. Restrict the secrets directory to
the operator. The API's mounted file must be readable by the container's Node
user; choose ownership/permissions matching that image's UID. On the database
host the official PostgreSQL entrypoint must be able to read its copy. Compose
secrets are protected bind-mounted files in this setup, not an encrypted secret
store. Keep host backups and access controls accordingly.

Create `/etc/clearcsv/certs` on the API host, even for VPN-only transport. If the
PostgreSQL server is independently configured for TLS, place its trusted CA as
`/etc/clearcsv/certs/ca.pem`, set `PGSSLMODE=verify-full` and
`PGSSLROOTCERT=/run/certs/ca.pem`. Use a PGHOST
matching the server certificate. The stock database Compose file relies on the
VPN with `PGSSLMODE=disable`; it does not provision server TLS certificates or
enable PostgreSQL TLS. Never disable certificate verification for a TLS connection.

For private GHCR packages, put a least-privilege read token into a protected file
and log in on each application host:

```bash
bash deploy/registry-login.sh YOUR_GITHUB_USERNAME /protected/ghcr-token
```

This uses `docker login --password-stdin`. Configure Docker's credential helper
or protect its credential directory; registry login persists local credentials.
Use CI's secret store for CI tokens and verified SSH host keys. Do not enable
shell tracing (`set -x`) around secret handling.

Application images must already be published as explicit immutable commit tags
such as `ghcr.io/your-owner/clearcsv-api:sha-<40-character-commit>` or protected
version tags such as `:v1.2.3`. Set `APP_VERSION` to exactly that tag on each host.
Do not move a release tag after publishing it. The deploy script rejects
`:latest`, untagged images, non-GHCR application images, and version mismatches.

## First deployment

On the **database host**, choose a persistent volume name, set it as
`POSTGRES_VOLUME`, then create it explicitly once:

```bash
docker volume create clearcsv-postgres-data
bash deploy/remote-deploy.sh database /etc/clearcsv/database.env up
```

The external named volume survives container replacement and `compose down`.
Never delete that volume as a routine release/rollback step. Back it up and test
restoration before using valuable data. Initialization credentials only apply
to a new volume; editing an env file does not rotate an existing database user.

On the **API host**, verify the VPN/DNS route to PostgreSQL, then run the controlled
migration step separately from server startup:

```bash
bash deploy/remote-deploy.sh api /etc/clearcsv/api.env migrate up
bash deploy/remote-deploy.sh api /etc/clearcsv/api.env up
```

The migration command pulls the explicit API release image and runs
`node dist-api/migrate.js up`. Ordinary application startup never runs migrations.
Migration failure exits nonzero; fix connectivity or schema issues before
starting the new API. The API's readiness check requires its schema and database
to be available.

On the **frontend host**, set `API_UPSTREAM` and the frontend bind address, then:

```bash
bash deploy/remote-deploy.sh frontend /etc/clearcsv/frontend.env up
```

Nginx proxies `/api/` to the remote API and `/api-health` to its `/health`, keeping
browser requests on the frontend origin. `/health` verifies Nginx itself.
`/config.json` must report the requested `appVersion`, `apiUrl: ""` and
`historyEnabled: true`. Deployment checks the JSON fields, not only HTTP 200.
It also checks `/api-health` through Nginx and requires the API to report the
same release tag; deploy the API before its matching frontend release.

## Release and rollback demonstration

Keep reviewed env files for release A and release B, with different explicit image
tags and matching `APP_VERSION`. Keep all network, database, and secret paths
unchanged between those files. Use a schema-compatible pair of releases.

1. Deploy A to the API and frontend hosts using `up`. Save its image references.
   In the browser create a shared history entry; record its ID/metadata.
2. On the API host run B's `migrate up` only when its release requires a reviewed
   migration, then apply B's `up`. On the frontend host apply B's `up`.
3. Check `/api-health` through the frontend: its `version` must identify B's API.
   Check `/config.json`: `appVersion` must identify B's frontend. Confirm the
   previously recorded history entry is still present.
4. Reapply A explicitly, first on the API host and then on the frontend host:

   ```bash
   bash deploy/remote-deploy.sh api /etc/clearcsv/api-release-a.env rollback
   bash deploy/remote-deploy.sh frontend /etc/clearcsv/frontend-release-a.env rollback
   ```

5. Verify A's version on both endpoints and that the same history entry remains.
   This demonstrates image replacement and persistent database storage. A real
   result requires running on your hosts; local configuration checks do not
   constitute a remote deployment.

`rollback` always uses the image explicitly named in its provided env file. It
does not guess a previous tag, execute SSH, reverse migrations, or restore data.
App rollback is safe only when the current schema remains compatible with the
old application. Plan expand/contract migrations and backups accordingly.

For a **disposable database only**, reversible SQL can be demonstrated separately:
stop the API first, then run `ALLOW_DB_ROLLBACK=disposable bash
deploy/remote-deploy.sh api /etc/clearcsv/api.env migrate down`, which reverses one
migration. The API is expected to be unready while required schema is absent.
Run `migrate up` again before restarting it. Never use this operation as routine
production app rollback; down migrations may discard data.

## Failures and verification

Every deploy pulls the selected image, waits for container health, then verifies
the actual local HTTP endpoint and exact runtime version. Failure returns nonzero.
The last healthy image/version is retained in
`/etc/clearcsv/.clearcsv-ROLE/current-release`, with its predecessor in
`previous-release`. These files contain no credentials. A failed release is left
available for inspection; explicitly restore the known-good app images with
`rollback` after assessing schema compatibility. No automatic rollback masks
migration/data problems.

Use `status` to inspect service/container state. Inspect logs on the host through
the matching Compose file and env file; logs can contain application data, so
share only redacted excerpts. Check DNS, VPN/firewall rules, password file access,
PostgreSQL credentials and migration state when API readiness fails.

Local, non-destructive checks (no hosts contacted or images published):

```bash
bash -n deploy/remote-deploy.sh deploy/registry-login.sh
python3 deploy/test_verify.py
bash deploy/test-remote.sh
docker compose --env-file deploy/frontend.env.example -f deploy/compose.frontend.yml config --quiet
docker compose --env-file deploy/api.env.example -f deploy/compose.api.yml config --quiet
docker compose --env-file deploy/database.env.example -f deploy/compose.database.yml config --quiet
```

## GitHub workflow environment-file location

Set repository variable `DEPLOY_PATH` to the absolute repository checkout path on all three hosts. `DEPLOY_ENV_DIR` selects the protected role configuration directory and defaults to `/etc/clearcsv`, matching the manual commands above. Put `frontend.env`, `api.env`, and `database.env` on their respective hosts there. The workflow uses that directory separately from the checkout, applies the chosen API migration, deploys each role, and verifies HTTP/version health. Keep these files outside Git.

## Example Docker-aware network restrictions (operator step)

Prefer a private/VPN network with security-group rules allowing only frontend-to-API and API-to-database. If Linux iptables is your host firewall, the following examples match Docker's original published destination before DNAT. Replace the shell variables with the real private addresses first; do not run placeholder values. Apply on the named host after checking its existing firewall policy:

```bash
# API host: API_PRIVATE_IP is this host's bound private IP;
# FRONTEND_PRIVATE_IP is the only frontend host allowed to connect.
sudo iptables -I DOCKER-USER 1 -p tcp -m conntrack --ctdir ORIGINAL \
  --ctorigdst "$API_PRIVATE_IP" --ctorigdstport 3000 \
  ! -s "$FRONTEND_PRIVATE_IP/32" -j DROP

# Database host: DB_PRIVATE_IP is this host's bound private IP;
# API_PRIVATE_IP is the only API host allowed to connect.
sudo iptables -I DOCKER-USER 1 -p tcp -m conntrack --ctdir ORIGINAL \
  --ctorigdst "$DB_PRIVATE_IP" --ctorigdstport 5432 \
  ! -s "$API_PRIVATE_IP/32" -j DROP
```

These are IPv4 examples; adapt to your actual ports/firewall backend and persist the rules with your distribution's firewall tooling. They restrict published container ports, not SSH. Administrative database access stays through SSH to the DB host and `docker compose exec`. Verify allowed access from the required host and denied access from another host before accepting deployment. These rules have not been applied to any remote infrastructure in this task.

Staging in this repository is the isolated local `clearcsv-disposable-demo` project. Production is the normal Compose project or the three separate hosts. Do not reuse production env files, credentials or volumes in the staging demo; use separate hosts/configuration directories if running remote staging.
