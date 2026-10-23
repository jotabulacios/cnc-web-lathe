import { test, expect } from '@playwright/test';
import { tab } from './workbench';

test('ISO designations swap the displayed T1 geometry and only change the cut when rε is copied', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('T0101\nS900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for (let i = 1; i <= 2; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toHaveAttribute('data-tool-id', 'roughing-od');
  const before = JSON.parse(await canvas.getAttribute('data-tool-body-bounds') ?? '[]') as number[];

  await tab(page, 'Herramientas');
  await page.locator('.iso-tools summary').click();
  await page.getByRole('textbox', { name: 'T1 inserto ISO' }).fill('DNMG 150604');
  await page.getByRole('textbox', { name: 'T1 porta ISO' }).fill('PCLNR 2020K12');
  await expect(page.getByTestId('iso-roughing-od')).toHaveAttribute('data-state', 'invalid');
  await expect(page.getByTestId('iso-roughing-od').getByRole('alert')).toBeVisible();
  await page.getByRole('textbox', { name: 'T1 inserto ISO' }).fill('CNMG 120408');
  await expect(page.getByTestId('iso-roughing-od')).toHaveAttribute('data-state', 'valid');
  await expect(page.getByTestId('active-tool-dimensions')).toContainText('Nominal ISO, no datos de fabricante');
  // Display-only: the run is not invalidated and the cursor stays.
  await expect(page.getByTestId('block-count')).toHaveText('2 / 6');
  await expect.poll(async () => {
    const bounds = JSON.parse(await canvas.getAttribute('data-tool-body-bounds') ?? '[]') as number[];
    return bounds[3] - bounds[2];
  }).toBeGreaterThan(before[3] - before[2]);
  await page.locator('.tool-inspector summary').click();
  await expect(page.getByTestId('inspector-provenance')).toContainText('ISO 1832');

  // Copying rε is a real setup change: offsets get 0,8 and the run must be reinterpreted.
  await page.getByRole('button', { name: 'Usar rε 0,8 mm en correctores' }).click();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Pieza');
  // A table with values opens by itself.
  await expect(page.locator('.offsets-editor')).toHaveAttribute('open', '');
  await expect(page.getByRole('textbox', { name: 'T1 Radio de punta R' })).toHaveValue('0.8');

  // Saved with the document.
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Herramientas');
  await expect(page.getByRole('textbox', { name: 'T1 inserto ISO' })).toHaveValue('CNMG 120408');
  expect(errors).toEqual([]);
});
