# ClearCSV complete DevOps implementation plan

Goal: preserve browser CSV processing and add metadata-only history with a reproducible three-tier delivery workflow.
Architecture: React/Vite browser -> Fastify TypeScript API -> PostgreSQL 17.6. Browser data never leaves the tab; saving summary counts is explicit. Same-origin nginx API proxy for Docker; configurable external URL for Vercel. node-pg-migrate uses explicit reversible migrations.
Spec: user enhancement brief in this chat. User explicitly requests implementation directly in existing repository, a short plan then proceed; no design approval gate or worktree.

## Audit
- Node24, pnpm11.25.0 single root lockfile; React19.3,TS7,Vite8.3,Vitest5,Playwright1.64.
- Existing32 CSV tests and production build pass before edits.
- Existing frontend Docker/CI smoke; no backend/database/history/migrations/registry deployment.
- CSP connect-src self prevents external API; use same-origin proxy and explicit Vercel API-origin policy configuration.
- Existing Docker base versions float; pin patch images. No Docker daemon initially; starting Desktop.
- User report/image/CSV untracked files preserved. No push or registry publishing from this local session.

## Implementation tasks
- [x] API + storage: write failing HTTP validation/unavailable tests and real PostgreSQL integration tests; add Fastify, pg, node-pg-migrate; implement health, bounded history, idempotent writes, error redaction, graceful shutdown.
- [x] Two tracked migrations: create constrained processing_runs; add app_version. Integration test clean up, first migration + row + second migration + safe down/up in disposable isolated schema, ensure retained counts.
- [x] Frontend: runtime/build API configuration, explicit metadata save/retry and history; test actual payload and unavailable behavior; preserve32 CSV tests and6 workflows.
- [x] Containers: frontend/API multistage, official pinned PostgreSQL; named volume/internal network; controlled migration one-shot; persistent password files; nonroot apps. Verify health, storage after DB recreate, DB outage/recovery, backup/restore.
- [x] CI: extend verify job with temporary PostgreSQL, migrations/integration/E2E; compose container smoke; publish exact SHA and release tags after checks main only; opt-in production environment SSH deployment to three roles and health verification.
- [x] Delivery/demo: exact commands, architecture, setup, secrets, TLS/private network/firewall, migration recovery vs app rollback; executable staging release and failure/rollback demonstration; actual evidence ledger.
- [x] Run full checks and fresh review. Fix important defects; leave external deployment and publishing explicitly unverified without credentials.

## Review focus
No CSV leaks in payload/logs. No credentials in source/logs. API failure must never block cleaning/download. A retry must not duplicate a run. Application rollback must not invoke database down. No public DB port in local Compose. Destructive demos restricted to explicitly disposable resources. Metadata endpoints intentionally no accounts, trusted classroom/staging only; public production access requires upstream auth/TLS. CI pull requests never receive package write/deploy secrets.


## Verification ledger
- Baseline:32 original CSV tests and Vite build passed before modification.
- Final:37 frontend/helper tests,19 API validation/outage tests,5 real PostgreSQL integration tests,14 real full-stack browser checks passed. All32 original CSV cases retained.
- Docker:both application images built; nonroot users; official PostgreSQL; controlled migration exit0; frontend/API/DB healthy; DB has no host port. Local API port13001 because3000 belongs to another app; saved only in ignored .env.
- Full disposable demo completed twice, including a clean-volume final run:9 genuine assertions for storage persistence, nonroot, dump/restore,503/reconnect, release1/2, bad-release detection, rollback preserving rows, separate migration/data recovery.
- CI workflow validated with actionlint1.7.7; final file-only validation used read-only bind and network disabled. Initial broad repository bind was rejected by automatic approval review, then scope was safely narrowed.
- Deployment:4 JSON checks and mocked shell state/rollback guard passed. Fresh review found env-path mismatch; fixed DEPLOY_ENV_DIR separately from checkout. No remaining important review findings.
- Ruling:use node-pg-migrate explicit reversible SQL rather than Prisma for one table and an honest down demo. Cost:SQL schema and queries are maintained together.
- Ruling:history save is opt-in and UUID retries idempotent; no CSV rows/names in request/logs.
- Ruling:after-fill duplicates may exceed original duplicates when deduplication is off; corrected draft unreleased initial constraint, with a regression test, and aligned the task-created fixture DB without deleting records.
- Ruling:bound browser workers to2 after a10-worker run hit2-second connection pressure while Docker builds ran; full14 then passed against final stack. No CSV tests removed or weakened.
- Remote hosts, new GitHub workflow execution, registry publication and production/Vercel update are unverified and were not claimed. No commit or push.


## Authorized publication follow-up
The user requested push and report update. Implementation commit da2caaa24b447cc5166af4e61a3d7b0cd84afcf5 was pushed to main. GitHub Actions run 41336945319 verify and publish jobs succeeded; both SHA-tagged GHCR images were published. The deployment job was skipped by the manual gate. Current-commit Vercel frontend status is success; three-host deployment remains unverified. Updated report preserves Somaiya metadata and records these real outcomes. A subsequent documentation/report-only commit does not change the tested application code.
