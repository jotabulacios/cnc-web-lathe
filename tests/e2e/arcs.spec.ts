import { test, expect } from '@playwright/test';
import { tab } from './workbench';

const convex = 'G21 G18 G98\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nM30';
const concave = 'G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30';
const nonMonotonic = 'G21 G18 G98\nS900 M03\nG00 X20 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30';

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('G03 draws a counterclockwise arc, flattens it in the profile and keeps playback available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(convex);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  const viewport = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ });
  const arc = viewport.locator('path[data-arc]');
  await expect(arc).toHaveCount(1);
  await expect(arc).toHaveAttribute('data-arc', 'ccw');
  await expect(arc).toHaveAttribute('d', /M .* A [\d.]+ [\d.]+ 0 0 0 /);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 3');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 4');
  await expect(page.locator('.profile-warning')).toHaveCount(0);
  await expect(page.locator('.aux-reading', { hasText: 'AVANCE F' })).toContainText('G03 · Arco antihorario');
  await expect(page.locator('.learning-copy h2')).toHaveText('G03 · Arco antihorario');
  // The explanation details are open by default inside the Explicación tab.
  await tab(page, 'Explicación');
  await expect(page.locator('.learning-copy')).toContainText('Radio: 10 mm. Barrido: 90°. Sentido: antihorario');
  await expect(page.locator('.learning-copy')).toContainText('aproxima el arco con tramos lineales');
  await tab(page, 'Pieza');
  await page.locator('.profile-details summary').click();
  const rows = page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr');
  expect(await rows.count()).toBeGreaterThan(10);
  await expect(rows.last()).toContainText('0');
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toHaveAttribute('data-profile-blocks', '4');
  const expected = Math.PI * 62500 - Math.PI * (6250 - 5000 / 3 - 500 * Math.PI);
  const volume = Number(await canvas.getAttribute('data-profile-volume'));
  expect(Math.abs(volume - expected) / expected).toBeLessThan(1e-3);
  expect(errors).toEqual([]);
});

test('G02 draws a clockwise concave fillet and the profile follows it', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(concave);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  const viewport = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ });
  const arc = viewport.locator('path[data-arc]');
  await expect(arc).toHaveCount(1);
  await expect(arc).toHaveAttribute('data-arc', 'cw');
  await expect(arc).toHaveAttribute('d', /M .* A [\d.]+ [\d.]+ 0 0 1 /);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.locator('.learning-copy h2')).toHaveText('G02 · Arco horario');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 4');
  await expect(page.locator('.profile-warning')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reiniciar ejecución', exact: true }).click();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 5');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
});

test('a non-monotonic arc freezes the profile with ARC_IN_PROFILE instead of inventing spans', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(nonMonotonic);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await expect(page.locator('.profile-warning')).toContainText('ARC_IN_PROFILE');
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeDisabled();
  // The trajectory still shows the arc; only the material profile is frozen.
  await expect(page.getByRole('img', { name: /Torno CNC · vista longitudinal/ }).locator('path[data-arc]')).toHaveCount(1);
});
