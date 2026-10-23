import { test, expect } from '@playwright/test';
import { tab } from './workbench';

const program = 'T0101\nS900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30';

test('a T1 wear entry shifts the physical tip and the cut, while the DRO stays programmed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(program);
  await tab(page, 'Pieza');
  await page.locator('.offsets-editor summary').click();
  await expect(page.locator('.offsets-editor summary')).toContainText('todos en 0');
  const wear = page.getByRole('textbox', { name: 'T1 Desgaste X (Ø)' });
  await wear.fill('abc');
  await expect(page.locator('.offsets-editor [role=alert]')).toHaveText('Entre −100 y 100 mm.');
  await expect(page.getByRole('button', { name: /Interpretar programa/ })).toBeDisabled();
  await wear.fill('-0,2');
  await expect(page.locator('.offsets-editor summary')).toContainText('1 con valores');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await expect(page.getByTestId('tip-readout')).toHaveText('X 60.000 · Z 5.000');
  for (let i = 1; i <= 4; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
  }
  await expect(page.getByTestId('dro-x')).toHaveText('46.000');
  await expect(page.getByTestId('tip-readout')).toHaveText('X 45.800 · Z -30.000');
  await expect(page.getByTestId('tool-marker')).toBeVisible();
  await tab(page, 'Pieza');
  await page.locator('.profile-details summary').click();
  await expect(page.getByRole('table', { name: 'Medidas del perfil calculado' })).toContainText('45,8');

  // The table survives a local save and reopen; it requires a v2 project.
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Pieza');
  await expect(page.getByRole('textbox', { name: 'T1 Desgaste X (Ø)' })).toHaveValue('-0,2');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('tip-readout')).toBeVisible();
  // Back to zero: identical to the legacy setup, no physical-tip readout.
  await page.getByRole('textbox', { name: 'T1 Desgaste X (Ø)' }).fill('0');
  await expect(page.getByTestId('tip-readout')).toHaveCount(0);
  expect(errors).toEqual([]);
});
