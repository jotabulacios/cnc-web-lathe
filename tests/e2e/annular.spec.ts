import { test, expect, type Page } from '@playwright/test';
import { tab } from './workbench';

async function loadBoring(page: Page) {
  await tab(page, 'Pieza');
  await page.getByRole('button', { name: 'Cargar ejemplo de mandrinado', exact: true }).click();
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}
async function advance(page: Page, start: number, end: number) {
  for (let i = start + 1; i <= end; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
  }
}
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('tube example preserves its bore in 2D/3D and reconstructs on back and reset', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await loadBoring(page);
  await expect(page.getByLabel('Diámetro interior inicial', { exact: true })).toHaveValue('20');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'boring-id');
  await expect(page.getByLabel('Material restante', { exact: true })).toHaveAttribute('fill-rule', 'evenodd');
  await advance(page, 0, 5);
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(47500 * Math.PI, 6);
  await advance(page, 5, 11);
  await expect(canvas).toHaveAttribute('data-profile-blocks', '11');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(43000 * Math.PI, 6);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 10');
  await expect(canvas).toHaveAttribute('data-profile-blocks', '10');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(47500 * Math.PI, 6);
  await advance(page, 10, 15);
  await expect(page.getByTestId('block-count')).toHaveText('15 / 15');
  await page.getByRole('button', { name: /Reiniciar/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await expect(canvas).toHaveAttribute('data-profile-blocks', '0');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(52500 * Math.PI, 6);
  expect(errors).toEqual([]);
});

test('tube project survives local save and invalid material edits invalidate execution', async ({ page }) => {
  await loadBoring(page);
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro interior inicial', { exact: true }).fill('50');
  await expect(page.getByRole('button', { name: /Interpretar programa/ })).toBeDisabled();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Pieza');
  await expect(page.getByLabel('Diámetro interior inicial', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Herramienta inicial', { exact: true })).toHaveValue('boring-id');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await advance(page, 0, 5);
});

test('a rapid crosses an annular wall and freezes with exact source navigation', async ({ page }) => {
  await loadBoring(page);
  await tab(page, 'Programa');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('G00 X10 Z2\nG00 Z-40\nG00 X60');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await advance(page, 0, 2);
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 2');
  await page.getByRole('button', { name: /Ubicar RAPID_IN_STOCK en línea 3/ }).click();
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await expect(editor).toBeFocused();
  await expect(page.getByTestId('annular-volume')).toContainText('164933');
});

test('tubular facing and boring update both views, rewind and local persistence', async ({ page }) => {
  await loadBoring(page);
  const source = 'G21 G18 G98\nS900 M03\nT0404\nG00 X60 Z-5\nG01 X20 F120\nG00 Z2\nT0505\nG00 X30\nG01 Z-40\nG00 X18\nG00 Z2\nG00 X60 Z5\nM05\nM30';
  await tab(page, 'Programa');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(source);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await advance(page, 0, 5);
  const material = page.getByLabel('Material restante', { exact: true });
  const facedPath = await material.getAttribute('d');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toHaveAttribute('data-profile-blocks', '5');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(49875 * Math.PI, 6);
  await advance(page, 5, 9);
  await expect(canvas).toHaveAttribute('data-profile-blocks', '9');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(45500 * Math.PI, 6);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '8');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeCloseTo(49875 * Math.PI, 6);
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  await expect(material).toHaveAttribute('d', facedPath!);
  await advance(page, 8, 14);
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Programa');
  await expect(page.getByRole('textbox', { name: 'Programa G-code' })).toHaveValue(source);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await advance(page, 0, 14);
  await page.getByRole('button', { name: /Reiniciar/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
});
