import { test, expect } from '@playwright/test';
import { tab } from './workbench';

const facingProgram = 'G21 G18 G98\nS1000 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 Z2\nG00 X40 Z0\nG01 Z-20 F120\nM30';
const spindleOffFacing = 'G21 G18 G98\nG00 X54 Z-1\nG01 X0 F100\nM30';
const partialFacing = 'G21 G18 G98\nS1000 M03\nG00 X54 Z-1\nG01 X20 F100\nM30';

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('facing cut removes face material, shifts front face to Z-1, discounts 3D volume, and subsequent turning cuts cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(facingProgram);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');

  // Step to block 4 (facing cut at Z=-1 complete)
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 4');
  await expect(page.locator('.profile-warning')).toHaveCount(0);

  // Check explanation
  // The explanation details are open by default inside the Explicación tab.
  await tab(page, 'Explicación');
  await expect(page.locator('.learning-copy')).toContainText('Refrentado frontal');
  await expect(page.locator('.learning-copy')).toContainText('X (diámetro): 54 → 0 mm');

  // Check profile measurements table
  await tab(page, 'Pieza');
  await page.locator('.profile-details summary').click();
  const rowsFacing = page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr');
  await expect(rowsFacing).toHaveText(['-100-150', '-100']);

  // Check 3D volume: stock length 100 Ø50, 1mm refaced -> 99mm length Ø50 -> volume = 99 * 25^2 * pi = 61875 pi
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '4');
  const volumeFacing = Number(await canvas.getAttribute('data-profile-volume'));
  const expectedFacing = Math.PI * 61875;
  expect(Math.abs(volumeFacing - expectedFacing) / expectedFacing).toBeLessThan(1e-5);

  // Switch back to 2D and step to block 7 (turning complete)
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  for (let i = 4; i < 7; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 7');

  const rowsTurning = page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr');
  await expect(rowsTurning).toHaveText(['-100-2050', '-20-140', '-100']);

  // Check 3D volume at block 7:
  // 80mm length of Ø50 (r=25) -> 80 * 625 * pi = 50000 pi
  // 19mm length of Ø40 (r=20) -> 19 * 400 * pi = 7600 pi
  // 1mm refaced (r=0) -> 0
  // Total = 57600 pi
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '7');
  const volumeTurning = Number(await canvas.getAttribute('data-profile-volume'));
  const expectedTurning = Math.PI * 57600;
  expect(Math.abs(volumeTurning - expectedTurning) / expectedTurning).toBeLessThan(1e-5);

  expect(errors).toEqual([]);
});

test('facing validates spindle and rejects partial cuts', async ({ page }) => {
  // Spindle off
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(spindleOffFacing);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 2');
  await expect(page.locator('.profile-warning')).toContainText('SPINDLE_OFF');

  // Partial facing cut (does not reach X0)
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(partialFacing);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await expect(page.locator('.profile-warning')).toContainText('UNSUPPORTED_PROFILE_CUT');
});
