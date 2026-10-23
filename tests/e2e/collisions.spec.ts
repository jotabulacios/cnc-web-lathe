import { test, expect } from '@playwright/test';
import { tab } from './workbench';

// Educational collision warnings; nominal geometry, never a machine-safety check.
const INTO_JAWS = 'G21 G18 G98\nT0101\nS800 M03\nG00 X44 Z2\nG01 Z-90 F150\nG00 X60\nZ5\nM05\nM30\n';
const OLD_ARC = 'G21 G18 G98\nT0202\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nG00 X60\nZ5\nM05\nM30\n';

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('nominal jaws are drawn in 2D and 3D and follow the setup fields', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const plane = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ });
  const jaws = plane.getByTestId('chuck-jaws');
  await expect(jaws).toHaveAttribute('data-grip-mm', '15');
  await expect(jaws).toHaveAttribute('data-jaw-height-mm', '12');
  await expect(jaws.locator('rect')).toHaveCount(2);
  await tab(page, 'Pieza');
  await expect(page.getByLabel('Largo tomado por las mordazas')).toHaveValue('15');
  await page.getByLabel('Largo tomado por las mordazas').fill('30');
  await page.getByLabel('Altura de las mordazas sobre la pieza').fill('8');
  await expect(jaws).toHaveAttribute('data-grip-mm', '30');
  await expect(jaws).toHaveAttribute('data-jaw-height-mm', '8');
  await page.getByLabel('Largo tomado por las mordazas').fill('100');
  await expect(page.locator('#error-gripLength')).toContainText('todo el largo');
  await page.getByLabel('Largo tomado por las mordazas').fill('30');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-jaw-grip-mm', '30');
  await expect(canvas).toHaveAttribute('data-jaw-height-mm', '8');
  expect(errors).toEqual([]);
});

test('turning into the jaws warns at the exact block and marks the point once executed', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(INTO_JAWS);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  const warning = page.getByRole('button', { name: 'Ubicar JAW_COLLISION en línea 5, columna 1' });
  await expect(warning).toBeVisible();
  await expect(page.locator('.diagnostics li.warning')).toContainText('mordazas');
  await expect(page.locator('.diagnostics li.warning')).toContainText('no garantiza');
  const markers = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ }).getByTestId('collision-marker');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(markers).toHaveCount(0);
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(markers).toHaveCount(1);
  await expect(markers.first()).toHaveAttribute('data-code', 'JAW_COLLISION');
  // A warning: the run continues to the end.
  for (let i = 5; i < 9; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('block-count')).toHaveText('9 / 9');
});

test('the old arc practice reports the finishing holder hitting the part', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(OLD_ARC);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByRole('button', { name: 'Ubicar TOOL_HOLDER_COLLISION en línea 5, columna 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubicar TOOL_WORKING_ANGLE en línea 5, columna 1' })).toBeVisible();
  await expect(page.locator('.diagnostics li.warning').filter({ hasText: 'el mango' })).toHaveCount(1);
});
