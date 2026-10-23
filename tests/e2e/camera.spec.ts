import { test, expect } from '@playwright/test';
import { tab } from './workbench';

test('orthographic camera is a presentation toggle that keeps profile, cursor and section', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await tab(page, 'Pieza');
  await page.getByRole('button', { name: 'Cargar ejemplo de mandrinado', exact: true }).click();
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
  }
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toHaveAttribute('data-camera', 'perspective');
  const ortho = page.getByRole('button', { name: 'Ortográfica', exact: true });
  await ortho.click();
  await expect(ortho).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-camera', 'orthographic');
  await page.getByRole('button', { name: 'Acercar pieza' }).click();
  await expect(canvas).toHaveAttribute('data-ortho-zoom', '1.25');
  await page.getByRole('button', { name: 'Vista frontal Z/X' }).click();
  await expect(canvas).toHaveAttribute('data-camera-direction', '0,0,1');
  await page.getByRole('button', { name: 'Sección longitudinal', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-section', 'true');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(47500 * Math.PI, 6);
  await expect(page.getByTestId('block-count')).toHaveText('5 / 15');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '6');
  await expect(canvas).toHaveAttribute('data-camera', 'orthographic');
  // Survives a 2D round trip like the section toggle.
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-camera', 'orthographic');
  await page.getByRole('button', { name: 'Perspectiva', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-camera', 'perspective');
  await expect(page.locator('.three-view [role=alert]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
