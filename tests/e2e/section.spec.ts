import { test, expect, type Page } from '@playwright/test';
import { tab } from './workbench';

async function advance(page: Page, start: number, end: number) {
  for (let i = start + 1; i <= end; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
  }
}
const canvas = (page: Page) => page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
const volume = async (page: Page) => Number(await canvas(page).getAttribute('data-profile-volume'));
const toggle = (page: Page) => page.getByRole('button', { name: 'Sección longitudinal', exact: true });

test('boring section shows the interior tool and keeps physical volume, cursor and DRO', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await tab(page, 'Pieza');
  await page.getByRole('button', { name: 'Cargar ejemplo de mandrinado', exact: true }).click();
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await advance(page, 0, 5);
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-section', 'false');
  await expect(canvas(page)).toHaveAttribute('data-section-triangles', '0');
  const dro = [await page.getByTestId('dro-x').textContent(), await page.getByTestId('dro-z').textContent()];

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas(page)).toHaveAttribute('data-section', 'true');
  expect(Number(await canvas(page).getAttribute('data-section-triangles'))).toBeGreaterThan(0);
  expect(await volume(page)).toBeCloseTo(47500 * Math.PI, 6);
  await expect(canvas(page)).toHaveAttribute('data-tool-id', 'boring-id');
  await expect(canvas(page)).toHaveAttribute('data-tool-visible', 'true');
  await expect(page.getByTestId('block-count')).toHaveText('5 / 15');
  expect([await page.getByTestId('dro-x').textContent(), await page.getByTestId('dro-z').textContent()]).toEqual(dro);

  await advance(page, 5, 11);
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '11');
  await expect(canvas(page)).toHaveAttribute('data-section', 'true');
  expect(await volume(page)).toBeCloseTo(43000 * Math.PI, 6);
  // Section is a presentation choice: it survives a 2D round trip.
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-section', 'true');
  await page.getByRole('button', { name: /Reiniciar/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '0');
  expect(await volume(page)).toBeCloseTo(52500 * Math.PI, 6);
  await toggle(page).click();
  await expect(canvas(page)).toHaveAttribute('data-section', 'false');
  await expect(canvas(page)).toHaveAttribute('data-section-triangles', '0');
  expect(errors).toEqual([]);
});

test('tubular facing section keeps the empty front and rewinds in section mode', async ({ page }) => {
  await page.goto('./');
  await tab(page, 'Pieza');
  await page.getByRole('button', { name: 'Cargar ejemplo de mandrinado', exact: true }).click();
  const source = 'G21 G18 G98\nS900 M03\nT0404\nG00 X60 Z-5\nG01 X20 F120\nG00 Z2\nT0505\nG00 X30\nG01 Z-40\nG00 X18\nG00 Z2\nG00 X60 Z5\nM05\nM30';
  await tab(page, 'Programa');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(source);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await toggle(page).click();
  await advance(page, 0, 5);
  await expect(canvas(page)).toHaveAttribute('data-section', 'true');
  expect(await volume(page)).toBeCloseTo(49875 * Math.PI, 6);
  await advance(page, 5, 9);
  expect(await volume(page)).toBeCloseTo(45500 * Math.PI, 6);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '8');
  expect(await volume(page)).toBeCloseTo(49875 * Math.PI, 6);
  await expect(page.locator('.three-view [role=alert]')).toHaveCount(0);
});
