import { test, expect } from '@playwright/test';
import { tab } from './workbench';

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } });
test('without WebGL, 3D failure offers 2D and preserves execution', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(page.locator('.three-view [role=alert]')).toContainText('No se pudo iniciar la vista 3D');
  await page.getByRole('button', { name: 'Sección longitudinal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sección longitudinal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.three-view [role=alert]')).toContainText('No se pudo iniciar la vista 3D');
  await page.getByRole('button', { name: 'Volver a 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
});

test('without WebGL, tool inspector keeps silhouette and measures, retries, and preserves execution', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
  const alert = page.locator('.tool-preview [role=alert]');
  await expect(alert).toContainText('No se pudo iniciar la vista previa 3D');
  await expect(page.getByTestId('inspector-silhouette')).toBeVisible();
  await expect(page.getByTestId('inspector-overall')).toBeVisible();
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-attempt', '0');
  await alert.getByRole('button', { name: 'Reintentar vista previa' }).click();
  await expect(page.locator('.tool-preview')).toHaveAttribute('data-attempt', '1');
  await expect(alert).toContainText('No se pudo iniciar la vista previa 3D');
  await page.getByLabel('Herramienta a inspeccionar').selectOption('boring-id');
  await expect(page.getByTestId('tool-inspector')).toHaveAttribute('data-tool-id', 'boring-id');
  await expect(page.getByTestId('block-count')).toContainText('1 /');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 2');
});
