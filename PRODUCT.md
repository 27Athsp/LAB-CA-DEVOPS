# ClearCSV

## Platform
Web, responsive desktop and mobile.

## Stack
Delegated by the user. React, TypeScript, Vite and Papa Parse provide a static app suitable for Vercel; Vitest tests the processing engine, Playwright tests browser workflows. Node 24 and pnpm are used consistently for local, Docker and CI builds.

## Purpose
Implement the supplied CSV Data Quality DevOps Mini Project Guide as a Vercel-ready app instead of Streamlit. Upload CSV, inspect quality, clean a copy, compare results, download. Demonstrate tests and a container build. No pushes or deployments are authorized in this task.

## Users
The supplied guide describes a college mini-project and three-person team. The app should be understandable to someone inspecting a dataset for the first time.

## Constraints
No accounts, backend, database, cloud storage, analytics, or external processing. CSV contents stay in browser memory. A refresh discards data. Include Docker and a GitHub Actions workflow; the user will handle GitHub themselves.

## Assumptions
Brand name ClearCSV and the green, light visual direction are implementation choices. MVP supports comma-separated UTF-8 CSV, up to 5 MiB, 20,000 rows, 100 columns and 250,000 cells. Processing beyond these limits is outside scope.
