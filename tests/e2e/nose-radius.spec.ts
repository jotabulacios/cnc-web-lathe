import { test, expect } from '@playwright/test';
import { tab } from './workbench';

const chamfer = (compensated: boolean) => compensated
  ? 'T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nG40 G00 X60\nG00 Z5\nM30'
  : 'T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG01 X50 Z-5\nG00 X60\nG00 Z5\nM30';

test('a nose radius distorts a chamfer until G42 compensates it, while the DRO stays programmed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await tab(page, 'Pieza');
  await page.locator('.offsets-editor summary').click();
  const radius = page.getByRole('textbox', { name: 'T1 Radio de punta R' });
  await radius.fill('9');
  await expect(page.locator('.offsets-editor [role=alert]')).toHaveText('Entre 0 y 5 mm.');
  await radius.fill('0,8');
  const volumes: number[] = [];
  for (const compensated of [false, true]) {
    await tab(page, 'Programa');
    await page.getByRole('textbox', { name: 'Programa G-code' }).fill(chamfer(compensated));
    await page.getByRole('button', { name: /Interpretar programa/ }).click();
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
    for (let i = 1; i <= 8; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 8');
    if (compensated) {
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '← Anterior', exact: true }).click();
      await expect(page.getByTestId('dro-x')).toHaveText('50.000');
      await expect(page.getByTestId('tip-readout')).not.toHaveText('X 50.000 · Z -5.000');
      await expect(page.locator('.tip-reading span')).toContainText('Compensación G42 activa');
      await expect(page.locator('.learning-panel')).toContainText('G01');
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
    const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
    await expect(canvas).toHaveAttribute('data-profile-blocks', '8');
    volumes.push(Number(await canvas.getAttribute('data-profile-volume')));
    await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  }
  // The uncompensated chamfer leaves more material than the exact compensated one.
  expect(volumes[0]).toBeGreaterThan(volumes[1]);
  expect(errors).toEqual([]);
});
