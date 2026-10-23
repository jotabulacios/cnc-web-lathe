import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tab } from './workbench';

// Tall viewport so the whole dialog (sheet + comparison) fits in the screenshots.
test.use({ viewport: { width: 1600, height: 1500 } });

async function runPractice(page: Page, id: string, blocks: number, steps = blocks) {
  await page.goto('./');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for (let i = 0; i < steps; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('block-count')).toHaveText(`${steps} / ${blocks}`);
  await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${steps}`);
}
async function openSheet(page: Page) {
  await tab(page, 'Pieza');
  await page.getByRole('button', { name: 'Hoja de cotas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hoja de cotas' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Hoja de cotas' })).toBeVisible();
  return dialog;
}
/** Opt-in evidence: DIMENSION_SHEET_SCREENSHOTS=1 writes test-results/<name>.png. */
const shot = async (target: Locator, name: string) => { if (process.env.DIMENSION_SHEET_SCREENSHOTS) await target.screenshot({ path: `test-results/${name}.png` }); };
const dims = (dialog: Locator, kind: string) => dialog.locator(`[data-dim=${kind}] text`).allTextContents();

test('taper practice: final sheet dimensions the cone and compares every reference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await runPractice(page, 'taper', 19);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
  const dialog = await openSheet(page);
  await expect(dialog.getByTestId('sheet-status')).toHaveText('Final — bloque 19/19');
  expect((await dims(dialog, 'diameter')).sort()).toEqual(['Ø30', 'Ø46', 'Ø50']);
  expect(await dims(dialog, 'length')).toEqual(['40', '100']);
  expect(await dims(dialog, 'note')).toEqual(['Cono α/2 = 11,31° (incl. 22,62°) · 1:2,5']);
  await expect(dialog.getByTestId('sheet-title-block')).toContainText('taper-turning.nc');
  await expect(dialog.getByTestId('sheet-title-block')).toContainText('Dibujo educativo — no es un plano de fabricación');
  await expect(dialog.getByTestId('sheet-title-block')).toContainText('T1 Desbaste (80°) · T2');
  await expect(dialog.getByTestId('sheet-verdict')).toHaveText('Recorrido completo · referencias confirmadas');
  const rows = dialog.getByRole('table', { name: 'Pedido vs. obtenido' }).locator('tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText('Ø exterior en Z −75');
  await expect(rows.nth(4)).toContainText(/Ø exterior en Z 0\s*30\s*30/);
  await expect(rows.last()).toContainText('Volumen restante (mm³)');
  for (const cell of await rows.locator('td:last-child').allTextContents()) expect(cell).toBe('✓');
  await shot(dialog, 'dimension-sheet-taper');
  // Download uses the project download pattern and produces a standalone SVG.
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar SVG', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('hoja-de-cotas-taper-turning.svg');
  const svg = readFileSync(await download.path(), 'utf8');
  expect(svg).toMatch(/^<\?xml[^>]*>\n<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).toContain('Ø46');
  expect(svg).toContain('Dibujo educativo — no es un plano de fabricación');
  await expect(dialog.getByTestId('sheet-notice')).toHaveText('Se preparó la descarga de la hoja de cotas en SVG.');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('partial sheet follows the cursor and has no comparison until the end', async ({ page }) => {
  await runPractice(page, 'taper', 19, 6);
  const dialog = await openSheet(page);
  await expect(dialog.getByTestId('sheet-status')).toHaveText('Parcial — bloque 6/19');
  await expect(dialog.getByRole('img', { name: 'Hoja de cotas' })).toHaveAttribute('data-partial', 'true');
  // First roughing pass only: Ø42 over 29 mm on the Ø50 stock.
  expect((await dims(dialog, 'diameter')).sort()).toEqual(['Ø42', 'Ø50']);
  expect(await dims(dialog, 'length')).toEqual(['29', '100']);
  await expect(dialog.getByRole('table', { name: 'Pedido vs. obtenido' })).toHaveCount(0);
});

test('two-step practice: chained steps from the front face and per-span comparison', async ({ page }) => {
  await runPractice(page, 'two-steps', blockCount('two-steps'));
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Ver hoja de cotas · pedido vs. obtenido' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hoja de cotas' });
  expect((await dims(dialog, 'diameter')).sort()).toEqual(['Ø30', 'Ø40', 'Ø50']);
  expect(await dims(dialog, 'length')).toEqual(['20', '40', '100']);
  const rows = dialog.getByRole('table', { name: 'Pedido vs. obtenido' }).locator('tbody tr');
  await expect(rows).toHaveText([/Ø exterior en Z −70\s*50\s*50\s*0.*✓/, /Ø exterior en Z −30\s*40\s*40\s*0.*✓/, /Ø exterior en Z −10\s*30\s*30\s*0.*✓/]);
  await shot(dialog, 'dimension-sheet-two-steps');
});

test('arc and tube practices: radius note, bore diameters and bore depth', async ({ page }) => {
  await runPractice(page, 'arc-convex', blockCount('arc-convex'));
  let dialog = await openSheet(page);
  expect(await dims(dialog, 'note')).toEqual(['R5 convexo']);
  expect(await dims(dialog, 'length')).toEqual(['5', '30', '100']);
  await shot(dialog, 'dimension-sheet-arc');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await runPractice(page, 'boring-and-turning', blockCount('boring-and-turning'));
  dialog = await openSheet(page);
  expect(await dialog.locator('[data-dim=diameter][data-contour=inner] text').allTextContents()).toEqual(['Ø20', 'Ø30']);
  expect(await dims(dialog, 'length')).toEqual(['20', '100', '40']);
  await expect(dialog.getByTestId('sheet-title-block')).toContainText('interior Ø20');
  const rows = dialog.getByRole('table', { name: 'Pedido vs. obtenido' }).locator('tbody tr');
  await expect(rows).toHaveCount(13);
  await expect(rows.filter({ hasText: 'Ø interior en Z −35' })).toContainText('✓');
  await shot(dialog, 'dimension-sheet-tube');
});

const catalogue = ['exercises.json', 'annular-exercises.json'].flatMap(file =>
  JSON.parse(readFileSync(new URL(`../../fixtures/lathe/${file}`, import.meta.url), 'utf8')) as { id: string; blockCount: number }[]);
function blockCount(id: string) { return catalogue.find(e => e.id === id)!.blockCount; }
