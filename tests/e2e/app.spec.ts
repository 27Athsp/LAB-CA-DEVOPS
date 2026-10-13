import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('sample -> inspect -> clean -> compare -> download -> reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page).toHaveTitle(/ClearCSV/);
  await expect(page.getByRole('heading', { name: 'A clean start for your data.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clean data', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Try sample data' }).click();
  await expect(page.getByText('12 rows · 5 columns · Sample dataset')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Original data table' })).toContainText('Missing');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Rows 9–12 of 12')).toBeVisible();
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cleaning complete' })).toBeVisible();
  await expect(page.getByText('2 rows removed · 6 cells filled')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cleaned data table' })).not.toContainText('Missing');
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Original data table' })).toContainText('Missing');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download cleaned CSV' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('sample_data_cleaned.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Neha,Sales,33,50000,Delhi');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(11);
  await page.getByRole('checkbox', { name: 'Fill missing values' }).uncheck();
  await expect(page.getByRole('button', { name: 'Download cleaned CSV' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText('Meet your data, before you change it.')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('real uploads, friendly errors, and replacing a cleaned file', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Choose CSV file');
  await input.setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('name,age\na,2,extra') });
  await expect(page.getByRole('alert')).toContainText('expected 2');
  await input.setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') });
  await expect(page.getByRole('alert')).toContainText('empty');
  await input.setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('a\nb') });
  await expect(page.getByRole('alert')).toContainText('Choose a CSV file');
  await input.setInputFiles({ name: 'invalid-encoding.csv', mimeType: 'text/csv', buffer: Buffer.from([0xff, 0xfe, 0x61]) });
  await expect(page.getByRole('alert')).toContainText('not UTF-8');
  await input.setInputFiles({ name: 'first.csv', mimeType: 'text/csv', buffer: Buffer.from('name,age\nAsha,20\nRavi,\nNeha,24') });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clean data', exact: true }).click();
  await expect(page.getByText('0 rows removed · 1 cell filled')).toBeVisible();
  await input.setInputFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from('id,value\n001,hello\n002,world') });
  await expect(page.getByRole('button', { name: 'Download cleaned CSV' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Original data table' })).toContainText('001');
  await expect(page.getByText('Cleaning complete', { exact: true })).toHaveCount(0);
});

test('long cell content stays inside the table on small screens', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose CSV file').setInputFiles({ name: 'wide.csv', mimeType: 'text/csv', buffer: Buffer.from(`name,${'Long column '.repeat(10)},amount\nAsha,${'longvalue'.repeat(100)},25`) });
  await expect(page.getByRole('region', { name: 'Original data table' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
