# ClearCSV implementation plan

## Goal and architecture
Build the supplied CSV-quality project in the current folder for Vercel. A static React app owns session-only state; a pure TypeScript processing module owns parsing, reports, cleaning and export. Papa Parse handles CSV quoting. No backend, persistence, or external calls for CSV data.

## Requirements and decisions
- Node 24, pnpm 11.25.0. Exact dependency versions plus a lockfile.
- CSV values remain strings to preserve identifiers, leading zeroes and original text. Blank/whitespace-only cells normalize to empty strings.
- UTF-8 comma-separated files only; reject empty/header-only files, blank or duplicate headers, malformed quotes and unequal row widths. Bound file/row/column/cell sizes.
- A column is likely numeric if at least 80% of its nonempty cells are finite decimal/scientific numbers; leading-zero integers indicate text identifiers. Report invalid cells only in likely-numeric columns, without replacing them.
- Deduplicate normalized rows first; fill numeric blanks with median of valid finite numbers and text blanks with most frequent exact value (ties use first occurrence). Empty columns stay blank. If filling creates new duplicates, remove them when duplicate removal is selected.
- Original data remains unchanged. Changing cleaning options invalidates the previous result. A new file invalidates all previous state; rapid file changes cannot mix results.
- Safe CSV download escapes formula-like text; valid negative numeric data stays numeric. Export headers are protected too. Document this intentional safety transformation.
- UI: upload/sample, metrics, original/cleaned preview, column quality, two cleaning checkboxes, before/after results and CSV download. Keyboard accessible, responsive and readable with wide/long input.
- Docker serves the same built static assets on port 8080 with nonroot nginx. CI typechecks, tests, builds, runs browser tests, then builds and smoke-tests Docker. No publishing.

## Tasks
- [x] Processing: create behavioral tests first, observe failure, implement src/lib/processor.ts, pass tests.
- [x] UI: implement App plus UploadArea, DataPreview, QualityReport and CleaningPanel with shared CSS tokens; use real processing and sample CSV.
- [x] Delivery: Dockerfile, nginx config, vercel.json, CI workflow, README and sample dataset.
- [x] Verify: typecheck, unit tests, build, desktop/mobile browser flow, Docker build and HTTP smoke test. Fix concrete failures, review and report limitations.

## Verification record
2026-10-13: 32 processing tests pass; TypeScript and production build pass; six Playwright checks pass against both the Vite preview (initial 30-unit-test implementation) and final Docker image (32-unit-test implementation). Docker responds HTTP 200, runs as user 101 and reports healthy. Built-in-browser inspection confirmed desktop and mobile layout, sample cleaning and zero app warnings/errors. No remote CI or Vercel deployment was run.

Code review found dropped quoted-empty single-column records; reproduced with two failing tests, then fixed parsing and export and verified all 32 tests pass. Visual review accepted the result and suggested removing an invisible file-input tab stop; the visible Choose CSV button now owns keyboard access. Screenshots are saved outside the repository as local QA artifacts.

## Review focus
Quoted/newline CSV values; formula-safe exports; all-empty and invalid numeric columns; duplicate behavior after filling; leading-zero identifiers; stale file/result state; accessible file errors and wide table overflow.
