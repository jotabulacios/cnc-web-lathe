import { test, expect } from '@playwright/test';

// Facing to X0 under G96: at the centre the speed is capped by G50.
const program = 'G50 S3000\nG96 S150 M03\nG99\nG00 X52 Z0\nG01 X0 F0.1\nG00 Z2\nG00 X46\nG01 Z-20 F0.2\nG97 S800\nG00 X60 Z5\nM05\nM30';

test('G96/G99 show cutting speed, feed unit and an advancing time estimate', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(program);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  const time = page.getByTestId('time-readout');
  await expect(time).toHaveText(/^Tiempo estimado 0:00 \/ \d+:\d\d$/);
  const total = (await time.textContent())!.split(' / ')[1];
  for (let i = 1; i <= 5; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 5');
  await expect(page.getByTestId('dro-css')).toHaveText('G96 · Vc 150 m/min · máx 3000 rpm');
  await expect(page.getByTestId('dro-feed')).toContainText('mm/vuelta · G99');
  // At X0 the G96 speed would be unbounded: the DRO shows the G50 limit.
  await expect(page.locator('.spindle-reading strong')).toContainText('3000');
  await expect(time).not.toHaveText(`Tiempo estimado 0:00 / ${total}`);
  for (let i = 6; i <= 9; i++) await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 9');
  await expect(page.getByTestId('dro-css')).toHaveCount(0);
  await expect(page.locator('.spindle-reading strong')).toContainText('800');
  // A missing G50 is diagnosed instead of letting the spindle run away.
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('G96 S150 M03\nG00 X50 Z2\nM30');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByRole('button', { name: /Ubicar CSS_NO_LIMIT/ })).toBeVisible();
  expect(errors).toEqual([]);
});
