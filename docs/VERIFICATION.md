# Local verification and delivery record

Verified on 1 November 2026. These are actual local results, not a claim that the new GitHub workflow, registry publishing or remote production deployment has run.

## Observed results

| Check | Result |
| --- | --- |
| Baseline before editing | Existing 32 CSV cases and frontend build passed |
| `pnpm check` | Passed: typechecks, 37 frontend/helper tests, 19 API tests, both builds |
| `pnpm test:db` | Passed: 5 real PostgreSQL tests in random disposable schemas/container |
| `HISTORY_E2E=true E2E_BASE_URL=http://127.0.0.1:8080 pnpm test:e2e` | 14 passed, desktop and mobile; includes real API save/reload |
| `pnpm test:containers` | Passed: frontend/proxy/API readiness, JSON version, actual metadata save/read, retry deduplication, invalid metadata rejection |
| Docker build / Compose | Both final app images built; DB/API/frontend healthy; migration exit0 |
| Runtime users / database network | API `node`, frontend `101:101`; local PostgreSQL no published host port |
| `node scripts/devops-demo.mjs` | All 9 assertion groups passed on a clean disposable volume |
| `python3 -m unittest discover -s deploy -p 'test_*.py'` | 4 passed |
| `bash deploy/test-remote.sh` | Passed simulated deployment state, bad-version failure, explicit rollback and guarded down1 |
| Three remote Compose configurations | All parse/validate successfully; no hosts contacted |
| GitHub Actions workflow | actionlint1.7.7 passed, including final changes |
| Source whitespace | `git diff --check` passed |
| Fresh independent review | Deployment env-path mismatch fixed; no remaining important findings |

The demo actually verified these independent behaviors:

- Release 1 is healthy; actual sample metadata stored
- Both application containers run as non-root users
- Metadata survives PostgreSQL container recreation using the same named volume
- pg_dump backup restored into a separate disposable database with the original row
- Database outage gives API 503 while frontend remains available; API reconnects after recovery
- Release 2 uses separate image tags and shows a new version in the UI and API health
- Controlled bad release fails container/HTTP verification only in disposable staging
- Application rollback redeploys release 1 images; both release records remain in PostgreSQL
- Separate disposable migration demo: first schema + row, additive second schema, down one, up recovery, full backup restores dropped version values

## Concrete local evidence

- Final demo timestamp: `2026-11-01T18:20:34.736Z`.
- Compose project: `clearcsv-disposable-demo`.
- Release1 run ID: `48105b40-7b23-4852-a3c0-ad3a34975f9b`.
- Release2 run ID: `396b3c9d-c613-43c4-aaa3-999da660e8c5`.
- Both IDs remained after application image rollback.
- Ignored `.devops-demo/results.json` retains actual assertions/IDs. Protected SQL backups live only in that ignored directory; they are not committed or uploaded.
- Main frontend: http://127.0.0.1:8080. Main API: http://127.0.0.1:13001 (port 3000 was occupied by an unrelated application; it was left untouched).
- Staging: http://127.0.0.1:18080, API 13000; release `1.0.0-demo.1` left running after rollback. `node scripts/devops-demo.mjs cleanup` removes only that disposable project/volume.
- The earlier temporary localhost/trust-auth integration container was removed; the reusable `pnpm test:db` runner uses a fresh random password and cleans its own random container.

## Failures investigated and corrected

- Initial integration attempt preceded completion of the first PostgreSQL image download; rerun after readiness passed.
- An initial 10-worker browser run had one failed console-health assertion: concurrent connection establishment reached the API's configured 2-second connection limit under local load. Browser concurrency is now explicitly 2; all 14 checks passed on the bounded rerun and again after rebuilding the final images. Test behavior/assertions were preserved.
- Regression tests exposed case-sensitive UUID retry comparison and legitimate duplicate increases after filling without deduplication. Both fixed; tests now pass. The initial unpublished migration constraint was corrected before release; the newly created fixture DB was aligned without deleting any records.
- Default API port 3000 was busy. The ignored local `.env` selects 13001; container smoke now reads the same configuration and checks JSON content type before parsing.
- Automatic approval review rejected mounting the whole repository into a workflow checker. Final check mounted only `ci.yml`, read-only, with network access disabled; it passed.

## Not executed / external prerequisites

- No commit, push, GHCR upload or production/Vercel modification was performed.
- The enhanced GitHub Actions workflow is linted and its local equivalents passed, but has not run on GitHub after these changes.
- GHCR publication requires pushing the reviewed code, Actions package permission, and a trusted main/release event. Existing SHA/release tags are reused/refused rather than overwritten.
- Three actual hosts, private/VPN network/firewall, gateway authentication/TLS, host registry login, SSH keys/verified known hosts and protected configuration still need to be supplied. Deployment scripts/configurations are executable and tested locally for syntax/state/verification, not claimed remotely successful.
- The shared metadata API intentionally has no per-user accounts. Use trusted classroom/VPN access or authenticated gateway; CORS is not authentication.
- The older Word report is unchanged and describes the previous browser-only architecture. Use the current README and DevOps demo guide for this implementation.

## Files modified

- `.dockerignore`
- `.github/workflows/ci.yml`
- `.gitignore`
- `Dockerfile`
- `README.md`
- `nginx.conf`
- `package.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`
- `src/App.tsx`
- `src/styles.css`
- `vercel.json`

## Files created

- `.env.example`
- `.gitattributes`
- `api/Dockerfile`
- `api/app.ts`
- `api/database.ts`
- `api/migrate.ts`
- `api/server.ts`
- `api/tests/app.test.ts`
- `api/tests/integration.test.ts`
- `api/tsconfig.json`
- `api/vitest.config.ts`
- `api/vitest.integration.config.ts`
- `compose.yaml`
- `deploy/.gitignore`
- `deploy/api.env.example`
- `deploy/compose.api.yml`
- `deploy/compose.database.yml`
- `deploy/compose.frontend.yml`
- `deploy/database.env.example`
- `deploy/frontend.env.example`
- `deploy/registry-login.sh`
- `deploy/remote-deploy.sh`
- `deploy/test-remote.sh`
- `deploy/test_verify.py`
- `deploy/verify.py`
- `docker/frontend-config.sh`
- `docs/DEVOPS_DEMO.md`
- `docs/THREE_HOST_DEPLOYMENT.md`
- `docs/VERIFICATION.md`
- `docs/superpowers/plans/2026-11-01-devops-completion.md`
- `migrations/1761955200000_create-processing-runs.sql`
- `migrations/1761955201000_add-app-version.sql`
- `public/config.json`
- `scripts/container-smoke.mjs`
- `scripts/devops-demo.mjs`
- `scripts/integration-test.mjs`
- `src/components/RunHistory.tsx`
- `src/lib/history.ts`
- `tests/e2e/history.spec.ts`
- `tests/history.test.ts`

Pre-existing untracked report/image/sample CSV files were preserved. Generated builds, passwords, environment files, backup data and dependency directories are ignored rather than included in this file list.
