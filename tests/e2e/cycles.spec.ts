import { test, expect } from '@playwright/test';
import { tab } from './workbench';

test('guided G71/G70 practice: one step per cycle, explained blocks, exact final part', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('cycle-roughing-finishing');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'En práctica: Ciclos G71 de desbaste y G70 de acabado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 12');
  const title = page.locator('.learning-panel h2');
  for (let cursor = 1; cursor <= 12; cursor++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
    if (cursor === 5) await expect(title).toHaveText('G71 · Parámetros de desbaste');
    if (cursor === 6) {
      await expect(title).toHaveText('G71 · Ciclo de desbaste');
      await expect(page.getByTestId('active-block')).toHaveText('G71 P10 Q50 U0.4 W0.1 F150 (sobremedida 0,4 en diámetro y 0,1 en Z)');
      await expect(page.getByTestId('dro-x')).toHaveText('52.000');
      await expect(page.getByTestId('dro-z')).toHaveText('2.000');
    }
    if (cursor === 9) {
      await expect(title).toHaveText('G70 · Acabado del perfil');
      await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
    }
  }
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
  // Rewind into the roughing result: confirmation is revoked.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 8');
  await expect(page.getByTestId('exercise-status')).not.toHaveAttribute('data-state', 'complete');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toHaveAttribute('data-profile-blocks', '8');
  for (let i = 9; i <= 12; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '12');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(45500 * Math.PI, 6);
  expect(errors).toEqual([]);
});

test('cycle mistakes are diagnosed at their line instead of being ignored', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('S900 M03\nG00 X52 Z2\nG71 P10 Q20 U0.4 W0.1 F150\nN10 G00 X20\nN20 G01 Z-10 F80\nM30');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByRole('button', { name: /Ubicar CYCLE_SEQUENCE en línea 3/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente bloque', exact: true })).toBeDisabled();
});
