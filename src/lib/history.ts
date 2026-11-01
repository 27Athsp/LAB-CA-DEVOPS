import type { QualityReport } from './processor';

export interface HistoryConfig { apiUrl: string; appVersion: string; historyEnabled: boolean }
export interface RunSummary {
  id: string;
  inputRows: number;
  outputRows: number;
  missingBefore: number;
  missingAfter: number;
  duplicatesBefore: number;
  duplicatesAfter: number;
  appVersion: string;
}
export interface SavedRun extends RunSummary { createdAt: string }
interface BuildConfig { VITE_API_URL?: string; VITE_APP_VERSION?: string }

export function createRunId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function resolveHistoryConfig(runtime: Partial<HistoryConfig> = {}, build: BuildConfig = {}): HistoryConfig {
  const apiUrl = (build.VITE_API_URL?.trim() || (typeof runtime.apiUrl === 'string' ? runtime.apiUrl.trim() : '')).replace(/\/+$/, '');
  return {
    apiUrl,
    appVersion: build.VITE_APP_VERSION?.trim() || (typeof runtime.appVersion === 'string' && runtime.appVersion.trim() ? runtime.appVersion.trim() : '1.0.0'),
    historyEnabled: !!build.VITE_API_URL?.trim() || runtime.historyEnabled === true,
  };
}

export async function loadHistoryConfig(build: BuildConfig = {}): Promise<HistoryConfig> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Configuration unavailable');
    const runtime: unknown = await response.json();
    return resolveHistoryConfig(runtime && typeof runtime === 'object' ? runtime : {}, build);
  } catch { return resolveHistoryConfig({}, build); }
}

export function createRunSummary(id: string, before: QualityReport, after: QualityReport, appVersion: string): RunSummary {
  return { id, inputRows: before.rows, outputRows: after.rows, missingBefore: before.missingCells, missingAfter: after.missingCells, duplicatesBefore: before.duplicateRows, duplicatesAfter: after.duplicateRows, appVersion };
}

function isSavedRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Record<string, unknown>;
  return typeof run.id === 'string' && typeof run.appVersion === 'string' && typeof run.createdAt === 'string' && Number.isFinite(Date.parse(run.createdAt)) &&
    ['inputRows', 'outputRows', 'missingBefore', 'missingAfter', 'duplicatesBefore', 'duplicatesAfter'].every((key) => Number.isSafeInteger(run[key]) && (run[key] as number) >= 0);
}

export async function getRuns(config: HistoryConfig): Promise<SavedRun[]> {
  const response = await fetch(`${config.apiUrl}/api/runs`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('History unavailable');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('runs' in data) || !Array.isArray(data.runs) || !data.runs.every(isSavedRun)) throw new Error('Invalid history response');
  return data.runs;
}

export async function saveRun(config: HistoryConfig, summary: RunSummary): Promise<SavedRun> {
  // Select the metadata fields explicitly so file contents can never enter this request.
  const { id, inputRows, outputRows, missingBefore, missingAfter, duplicatesBefore, duplicatesAfter, appVersion } = summary;
  const response = await fetch(`${config.apiUrl}/api/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ id, inputRows, outputRows, missingBefore, missingAfter, duplicatesBefore, duplicatesAfter, appVersion }),
  });
  if (!response.ok) throw new Error('Could not save run');
  const run: unknown = await response.json();
  if (!isSavedRun(run) || run.id !== summary.id) throw new Error('Invalid saved run response');
  return run;
}
