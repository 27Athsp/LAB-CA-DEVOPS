import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRunSummary, getRuns, loadHistoryConfig, resolveHistoryConfig, saveRun } from '../src/lib/history';
import { analyzeDataset, parseCsv } from '../src/lib/processor';

afterEach(() => vi.unstubAllGlobals());

describe('history configuration', () => {
  it('keeps standalone history off and supports same-origin runtime history', () => {
    expect(resolveHistoryConfig()).toEqual({ apiUrl: '', appVersion: '1.0.0', historyEnabled: false });
    expect(resolveHistoryConfig({ apiUrl: '', appVersion: '2.0.0', historyEnabled: true })).toEqual({ apiUrl: '', appVersion: '2.0.0', historyEnabled: true });
  });
  it('enables a configured build API even with the standalone runtime defaults', () => {
    expect(resolveHistoryConfig({ apiUrl: '', appVersion: '1.0.0', historyEnabled: false }, { VITE_API_URL: 'https://history.example.test/', VITE_APP_VERSION: '3.0.0' }))
      .toEqual({ apiUrl: 'https://history.example.test', appVersion: '3.0.0', historyEnabled: true });
  });
  it('loads runtime configuration and falls back safely when it is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ historyEnabled: true, apiUrl: '/history/', appVersion: '2.1.0' })).mockRejectedValueOnce(new Error('offline')));
    expect(await loadHistoryConfig()).toEqual({ historyEnabled: true, apiUrl: '/history', appVersion: '2.1.0' });
    expect(await loadHistoryConfig({ VITE_API_URL: 'https://api.example.test' })).toMatchObject({ historyEnabled: true, apiUrl: 'https://api.example.test' });
  });
});

describe('summary-only history requests', () => {
  it('derives only counts from the actual reports and sends an exact metadata payload', async () => {
    const before = analyzeDataset(parseCsv('private_name,age\nSecret,20\nSecret,20\nOther,'));
    const after = analyzeDataset(parseCsv('private_name,age\nSecret,20\nOther,20'));
    const summary = createRunSummary('710b1b66-53a1-4634-a2e5-e86eb30f4c8d', before, after, '1.2.0');
    const expected = { id: '710b1b66-53a1-4634-a2e5-e86eb30f4c8d', inputRows: 3, outputRows: 2, missingBefore: 1, missingAfter: 0, duplicatesBefore: 1, duplicatesAfter: 0, appVersion: '1.2.0' };
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      expect(_url).toBe('https://api.example.test/api/runs');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual(expected);
      return Response.json({ ...expected, createdAt: '2026-11-01T12:00:00.000Z' }, { status: 201 });
    });
    vi.stubGlobal('fetch', fetch);
    expect(summary).toEqual(expected);
    const config = resolveHistoryConfig({ historyEnabled: true, apiUrl: 'https://api.example.test/' });
    expect(await saveRun(config, { ...summary, contents: 'private CSV' } as typeof summary)).toMatchObject({ ...expected, createdAt: '2026-11-01T12:00:00.000Z' });
  });
  it('reads history and rejects unavailable or malformed API responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ runs: [] })).mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ runs: [{ id: 'invalid' }] })));
    const config = resolveHistoryConfig({ historyEnabled: true });
    expect(await getRuns(config)).toEqual([]);
    await expect(getRuns(config)).rejects.toThrow();
    await expect(getRuns(config)).rejects.toThrow();
  });
});
