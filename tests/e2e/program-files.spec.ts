import { test, expect } from '@playwright/test';
import { tab } from './workbench';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await tab(page, 'Prácticas');
});

test('G-code opens with current setup, clears guided ownership and execution, and preserves a recoverable document', async ({ page }) => {
  await tab(page, 'Programa');
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  const previous = await editor.inputValue();
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro de la pieza', { exact: true }).fill('64');
  const source = '; práctica 🛠\nG00 X80 Z8\nM30\n';
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de programa G-code', { exact: true }).setInputFiles({ name: 'practica.tap', mimeType: 'text/plain', buffer: Buffer.from('\uFEFF' + source.replaceAll('\n', '\r\n')) });
  await expect(page.getByTestId('project-notice')).toContainText('Programa abierto con la configuración actual');
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(source);
  await expect(page.getByLabel('Diámetro de la pieza', { exact: true })).toHaveValue('64');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Prácticas');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar proyecto JSON', exact: true }).click()]);
  const document = JSON.parse(await readFile((await download.path())!, 'utf8')).document;
  expect(document.exerciseId).toBeNull();
  expect(document.setup.stock.diameterMm).toBe(64);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 2');
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(editor).toHaveValue(previous);
  await expect(page.getByLabel('Diámetro de la pieza', { exact: true })).toHaveValue('64');
});

test('plain download retains unsupported words and imports diagnose them in Rust', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  const source = '; práctica\nG76 X20\n';
  await tab(page, 'Programa');
  await editor.fill(source);
  await tab(page, 'Prácticas');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar programa .nc', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('torno-programa.nc');
  expect(await readFile((await download.path())!, 'utf8')).toBe(source);
  await tab(page, 'Programa');
  await editor.fill('M30');
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de programa G-code', { exact: true }).setInputFiles((await download.path())!);
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByRole('button', { name: /Ubicar UNSUPPORTED_CODE/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente bloque', exact: true })).toBeDisabled();
});

test('invalid encoding, binary null and oversize programs keep compiled source and cursor', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await tab(page, 'Programa');
  await editor.fill('G00 X80 Z8\nM30\n');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  const input = page.getByLabel('Archivo de programa G-code', { exact: true });
  for (const [buffer, message] of [[Buffer.from([0xff]), 'UTF-8'], [Buffer.from('G00\0X20'), 'nulos'], [Buffer.alloc(256 * 1024 + 1, 32), '256 KiB']] as const) {
    await tab(page, 'Prácticas');
    await input.setInputFiles({ name: 'bad.nc', mimeType: 'text/plain', buffer });
    await expect(page.getByTestId('project-notice')).toContainText(message);
    await tab(page, 'Programa');
    await expect(editor).toHaveValue('G00 X80 Z8\nM30\n');
    await expect(page.getByTestId('block-count')).toHaveText('1 / 2');
  }
});

test('late program bytes cannot replace a newer edit or a project opened meanwhile', async ({ page }) => {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function() {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        (window as Window & { releaseProgram?: () => void }).releaseProgram = () => { void original.call(this).then(resolve, reject); };
      });
    };
  });
  const input = page.getByLabel('Archivo de programa G-code', { exact: true });
  await input.setInputFiles({ name: 'slow.nc', mimeType: 'text/plain', buffer: Buffer.from('M30') });
  await expect(page.getByTestId('project-notice')).toContainText('Leyendo programa');
  await tab(page, 'Programa');
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill('G00 X90 Z12');
  await page.evaluate(() => (window as Window & { releaseProgram?: () => void }).releaseProgram?.());
  await expect(page.getByTestId('project-notice')).toContainText('Se conservó tu edición');
  await expect(editor).toHaveValue('G00 X90 Z12');
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await input.setInputFiles({ name: 'slow.nc', mimeType: 'text/plain', buffer: Buffer.from('M30') });
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await page.evaluate(() => (window as Window & { releaseProgram?: () => void }).releaseProgram?.());
  await tab(page, 'Programa');
  await expect(editor).toHaveValue('G00 X90 Z12');
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto recuperado');
});
