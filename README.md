# ClearCSV

A CSV data quality workspace built for the DevOps mini-project. Upload a file, inspect missing cells and duplicate rows, clean a copy, compare the result, and download it. All CSV processing happens in your browser; files are not uploaded to a server or saved between visits.

## Tech stack

| Area | Choice | Why |
| --- | --- | --- |
| UI | React + TypeScript | Typed, reusable components and reliable interactive state |
| Build | Vite | Small static output suitable for Vercel and nginx |
| CSV | Papa Parse + pure TypeScript functions | Correct handling of quoted fields, embedded newlines and escaped quotes |
| Tests | Vitest + Playwright | Processing unit tests and desktop/mobile browser workflows |
| Container | Multi-stage Node build + nonroot nginx | Runtime contains only static assets, served on port 8080 |
| Automation | GitHub Actions | Typecheck, test, build, browser test and Docker smoke test |

This replaces the guide's Python/Streamlit/Pandas/Pytest stack with one TypeScript stack. A server, database and serverless functions are not needed for this MVP. Vercel serves `dist/`; Docker is an independent packaging/demo option, not Vercel's deployment mechanism.

## Run locally

Prerequisites: Node.js **24.x**. Install pnpm **11.25.0** if it is not already available:

```powershell
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. Commands work from the project root in PowerShell, bash or another terminal with Node and pnpm on PATH. Exact versions and `pnpm-lock.yaml` make installation repeatable. No API keys or environment variables are needed for the app.

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm preview` serves the production build on http://127.0.0.1:4173. `pnpm check` runs typecheck, processing tests and production build.

## Try the demo

1. Click **Try sample data**, or choose `sample_data.csv` from this folder.
2. Inspect 12 rows, 5 columns, 6 missing cells and 2 duplicate rows.
3. Leave both cleaning options selected and click **Clean data**.
4. The result has 10 rows, 0 missing cells and 0 duplicate rows.
5. Switch between **Original** and **Cleaned** to compare. Download `sample_data_cleaned.csv`.
6. Change an option: the previous result is cleared until you clean again. Remove the file to reset the workspace.

The sample uses synthetic records. After deduplication, missing ages become 33, missing salaries become 66000, the missing department becomes Engineering, and the missing city becomes Bengaluru.

## Processing rules

### Import and analysis

- Accept UTF-8, comma-separated CSV with a header and at least one data record. UTF-8 BOM and CRLF/LF line endings are supported.
- Reject non-CSV extensions, empty/header-only input, malformed quoting, rows with the wrong number of fields, and blank or duplicate column names. Header names are trimmed and case-sensitive.
- Skip physically blank lines. Preserve explicitly quoted empty single-column records (`""`). Whitespace-only cells normalize to empty strings; other text is preserved.
- Count duplicate rows as the extra occurrences beyond the first, comparing complete normalized rows.
- A column is likely numeric if at least **80%** of its nonempty cells are finite decimal/scientific numbers. Leading-zero integer strings (for example `001`) keep a column classified as text. Hexadecimal, Infinity, currency formatting and thousands separators are not interpreted as numeric.
- Numeric-invalid counts apply only to likely-numeric columns. This is a documented heuristic, not a schema validator. Arbitrary text columns are never converted wholesale to numbers.

### Cleaning

`cleanDataset` returns a new dataset and never mutates the original:

1. Copy and normalize cells.
2. If selected, remove identical rows, keeping the first occurrence.
3. Infer column types on the retained rows. If selected, fill numeric gaps with the median of valid numbers and text gaps with the most common value. Mode ties use the first value encountered.
4. Leave entirely empty columns and invalid numeric text unchanged.
5. If selected, remove duplicates that filling introduced as well.

The report is recomputed for the resulting dataset; inferred column types can change when duplicate removal changes the data distribution. “Cells filled” counts replacements made, including any in rows subsequently removed as duplicates. Turning off both options disables cleaning.

### Export

- Export headers and rows without an added index, as UTF-8 CSV with CRLF records and a UTF-8 BOM for spreadsheet compatibility.
- Quote fields as needed and explicitly quote empty fields so empty single-column records survive reimport.
- Prefix formula-like text with an apostrophe, including headers and formulas preceded by whitespace. Valid finite numeric values (including negative numbers) retain their text. This intentionally changes dangerous text in the downloaded CSV; the in-memory preview remains unchanged.

## Limits

- Maximum 5 MiB (shown as 5 MB in the UI), 20,000 rows, 100 columns, and 250,000 data cells. Exceeding any limit rejects the input.
- The preview shows eight rows per page; analysis and cleaning use the entire accepted dataset. Wide tables scroll within their container.
- All processing runs on the browser's main thread. The size limits keep this suitable for a small demo, not large analytical workloads.
- Median calculations use JavaScript numbers and their floating-point precision. Original nonempty values remain strings. This is not an exact-decimal accounting system.
- No date validation, schema configuration, outlier detection, Excel/XLSX support, persistence, login or collaboration.
- Refreshing or closing the tab clears the workspace. No CSV data is sent over the network; hosting still serves ordinary page requests.

## Automated tests

```powershell
pnpm test
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

The Playwright configuration starts the production preview automatically. Linux CI installs browser system dependencies using `pnpm exec playwright install --with-deps chromium`.

- **32 processing tests** cover parsing, blank records, quoting, validation, limits, analysis, numeric inference, median/mode filling, duplicates, nonmutation and formula-safe export.
- **6 browser checks** run three workflows at desktop and mobile sizes: the full sample/clean/compare/download/reset flow, real uploads and invalid input, and overflow with wide/long cell content.
- Browser failures retain traces and screenshots in ignored `test-results/`.

To run browser tests against the Docker app instead of the preview (PowerShell):

```powershell
$env:E2E_BASE_URL = 'http://127.0.0.1:8080'
pnpm test:e2e
Remove-Item Env:E2E_BASE_URL
```

## Docker

Start Docker Desktop in Linux-container mode, then:

```powershell
docker build -t clearcsv:local .
docker run --rm --name clearcsv -p 127.0.0.1:8080:8080 clearcsv:local
```

Open **http://127.0.0.1:8080**. The container runs as nginx user 101 and exposes `/health`. The final stage excludes Node, development dependencies and source code.

```powershell
docker inspect --format '{{.State.Health.Status}}' clearcsv
docker stop clearcsv
```

Base images use maintained Node 24 Alpine and nginx unprivileged stable Alpine tags, so future rebuilds pick up base-image updates. For byte-identical image inputs, pin image digests after validating the chosen updates.

## Vercel deployment when you are ready

Nothing was pushed or deployed as part of implementation. When you choose to publish:

1. Put this folder in your own repository, then import it into Vercel.
2. Select the **Vite** framework preset and this folder as the project root.
3. Use **Node 24.x** and output directory **dist**. Keep the install/build commands from `vercel.json`: `npx --yes pnpm@11.25.0 install --frozen-lockfile` and `npx --yes pnpm@11.25.0 build`. These explicitly select the tested pnpm version regardless of Vercel's default.
4. `vercel.json` contains the build configuration and security headers. No application secrets are required.
5. Deploy, then check the sample-data workflow and download on the resulting URL.

Alternatively, the Vercel CLI can deploy this directory when you explicitly choose to do so. The source is ready for Vercel; a live Vercel deployment has not been verified here.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vite static deployment](https://vite.dev/guide/static-deploy.html), [Papa Parse documentation](https://www.papaparse.com/docs).

## GitHub Actions

`.github/workflows/ci.yml` is prepared locally for you. It triggers on push, pull request or manual dispatch, and runs:

```text
Checkout → Node/pnpm → Locked install → Typecheck → Unit tests
         → Production build → Desktop/mobile browser tests
         → Docker build → Container HTTP smoke test
```

It does not push images or deploy. It needs no deployment credentials. GitHub-hosted execution can only be confirmed after you add the repository to GitHub and run the workflow. A green local run is not evidence of a green GitHub Actions run.

## Structure and team ownership

```text
src/
  lib/processor.ts              CSV analysis, cleaning and export
  components/                  Upload, preview, reports and cleaning controls
  App.tsx                      Session state and workflow integration
  styles.css                   Shared responsive visual system
tests/
  processor.test.ts            Processing behavior
  e2e/app.spec.ts               Browser workflows
sample_data.csv                Synthetic demonstration data
Dockerfile, nginx.conf         Container build and static server
vercel.json                    Vercel build and headers
.github/workflows/ci.yml        CI checks and image build
```

For a three-person team: A owns `processor.ts` and its unit tests; B owns UI and integration; C owns Docker, CI, browser tests and setup documentation. Agree on exported types before parallel edits.

## Submission evidence

Capture the original sample metrics, cleaned comparison and download, `pnpm test`, the Docker app/healthy container, and your eventual green GitHub Actions run. Explain the project as a browser-local CSV tool with automated tests, CI and container packaging. Claim cloud deployment only after actually deploying and verifying it.

## Troubleshooting

- **pnpm not recognized:** install Node 24, run the pnpm installation command above, and reopen your terminal.
- **Docker connection error:** start Docker Desktop and wait until its Linux engine is ready.
- **Port busy:** stop the process already using it, or use `pnpm dev --port 5174` / `docker run --rm -p 127.0.0.1:8081:8080 clearcsv:local`.
- **Browser executable missing:** run `pnpm exec playwright install chromium`.
- **Unreadable CSV:** export the file as comma-separated CSV UTF-8; check headers and quoted fields.
- **Some cells remain missing:** the column has no usable values from which to calculate a replacement.
