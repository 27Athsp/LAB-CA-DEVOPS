import { expect, test } from '@playwright/test';

test('saving is opt-in, retries one result id, and sends only summary counts', async ({ page }) => {
  // Plain HTTP deployments may not expose randomUUID, but still support getRandomValues.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  const requests: Record<string, unknown>[] = [];
  let runs: Record<string, unknown>[] = [];
  let configLoads = 0;
  await page.route('**/config.json', (route) => { configLoads++; return route.fulfill({ json: { historyEnabled: true, apiUrl: '', appVersion: '2.0.0' } }); });
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { runs } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (requests.length === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    const run = { ...body, createdAt: '2026-11-01T12:00:00.000Z' };
    runs = [run];
    return route.fulfill({ status: 201, json: run });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save run', exact: true })).toBeDisabled();
  await page.getByLabel('Choose CSV file').setInputFiles({ name: 'private_file.csv', mimeType: 'text/csv', buffer: Buffer.from('private_name,age\nSecret,20\nSecret,20\nOther,') });
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Save run', exact: true }).click();
  await expect(page.getByText(/Couldn’t save this run/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download cleaned CSV' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Run saved.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual({ id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), inputRows: 3, outputRows: 2, missingBefore: 1, missingAfter: 0, duplicatesBefore: 1, duplicatesAfter: 0, appVersion: '2.0.0' });
  expect(requests[1]).toEqual(requests[0]);
  await expect(page.getByRole('table', { name: 'Saved cleaning runs' })).toContainText('3 → 2');
  await page.reload();
  await expect(page.getByRole('table', { name: 'Saved cleaning runs' })).toContainText('3 → 2');
  expect(configLoads).toBe(2);
});

test('history failure leaves cleaning and download usable', async ({ page }) => {
  await page.route('**/config.json', (route) => route.fulfill({ json: { historyEnabled: true, apiUrl: '', appVersion: '1.0.0' } }));
  await page.route('**/api/runs', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/');
  await expect(page.getByText(/History is unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download cleaned CSV' }).click();
  expect((await downloaded).suggestedFilename()).toBe('sample_data_cleaned.csv');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('standalone runtime configuration keeps cleaning local', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/config.json', (route) => route.fulfill({ json: { historyEnabled: false, apiUrl: '', appVersion: '1.0.0' } }));
  await page.route('**/api/runs', (route) => { apiCalls++; return route.abort(); });
  await page.goto('/');
  await expect(page.getByText('Version 1.0.0')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run history' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download cleaned CSV' })).toBeEnabled();
  expect(apiCalls).toBe(0);
});

test('live API preserves a saved summary after reload', async ({ page }) => {
  test.skip(process.env.HISTORY_E2E !== 'true', 'Set HISTORY_E2E=true and E2E_BASE_URL to a running full-stack app.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible();
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save run', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const run = await response.json() as { id: string };
  await expect(page.getByText('Run saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-run-id="${run.id}"]`)).toContainText('12 → 10');
});
