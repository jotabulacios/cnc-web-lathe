import { test, expect, type Page } from '@playwright/test';
import { tab } from './workbench';

async function load(page: Page) {
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('boring-and-turning');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'En práctica: Mandrinado y cilindrado de un tubo', exact: true })).toBeVisible();
}
async function compile(page: Page) {
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}
async function finish(page: Page, inspect?: (cursor: number) => Promise<void>) {
  for (let cursor = 1; cursor <= 15; cursor++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
    await inspect?.(cursor);
  }
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
}
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('guided boring compares six inner/outer sections and revokes confirmation on rewind or material edit', async ({ page }) => {
  await load(page);
  await page.getByText('Cotas interiores, exteriores y volumen de referencia', { exact: true }).click();
  const table = page.getByRole('table', { name: 'Cotas anulares de referencia del ejemplo', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('tbody tr').first()).toHaveText(/-90.*20.*50.*2.*e-6/);
  await expect(table.locator('tbody tr').last()).toContainText('30');
  await expect(table.locator('tbody tr').last()).toContainText('40');
  await expect(page.locator('.practice-references')).toContainText('135.088,484104');
  await expect(table.locator('tr[data-state="unavailable"]')).toHaveCount(6);
  await compile(page);
  await expect(table.locator('tr[data-state="match"]')).toHaveCount(2);
  await expect(table.locator('tr[data-state="different"]')).toHaveCount(4);
  await finish(page, async cursor => {
    if (cursor === 5) {
      await expect(table.locator('tr[data-state="match"]')).toHaveCount(4);
      await expect(table.locator('tr[data-state="different"]')).toHaveCount(2);
    }
    if (cursor === 11) await expect(table.locator('tr[data-state="match"]')).toHaveCount(6);
  });
  await expect(page.getByTestId('annular-volume-difference')).toContainText('0 mm³');
  await expect(page.getByTestId('exercise-status')).toContainText('referencias confirmadas');
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'progress');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro interior inicial', { exact: true }).fill('22');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'modified');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Prácticas');
  await expect(table.locator('tr[data-state="unavailable"]')).toHaveCount(6);
});

test('guided tube identity survives save/reopen and restores a recoverable previous document', async ({ page }) => {
  const original = 'G00 X70 Z8\nM30';
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(original);
  await load(page);
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(page.getByRole('textbox', { name: 'Programa G-code' })).toHaveValue(original);
  await expect(page.getByRole('button', { name: 'Recuperar programa anterior (incluye configuración)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await tab(page, 'Prácticas');
  await expect(page.getByRole('heading', { name: 'En práctica: Mandrinado y cilindrado de un tubo', exact: true })).toBeVisible();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Prácticas');
  await expect(page.getByRole('heading', { name: 'En práctica: Mandrinado y cilindrado de un tubo', exact: true })).toBeVisible();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'pending');
  await compile(page); await finish(page);
});

test('annular rapid diagnostic freezes the tube, selects its source and loads a recoverable corrected path', async ({ page }) => {
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('diagnose-annular-rapid');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await compile(page);
  for (let cursor = 1; cursor <= 4; cursor++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
  }
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'observed');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 4');
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ubicar diagnóstico en línea 5', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('G00 X60');
  await editor.press('Shift+F8');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'progress');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 4');
  await editor.press('F8');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'observed');
  const original = await editor.inputValue();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Cargar corrección de referencia', exact: true }).click();
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(/G00 Z-30\nG00 Z2\nG00 X60 Z5/);
  await compile(page);
  for (let cursor = 1; cursor <= 7; cursor++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
  }
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
  await expect(page.getByTestId('annular-volume')).toContainText('164933,614');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(editor).toHaveValue(original);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'pending');
});

test('guided tubular face and bore confirms references only at program end and revokes on rewind', async ({ page }) => {
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('tubular-facing-and-boring');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await compile(page);
  await page.getByText('Cotas interiores, exteriores y volumen de referencia', { exact: true }).click();
  for (let cursor = 1; cursor <= 14; cursor++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
    await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', cursor === 14 ? 'complete' : 'progress');
  }
  await expect(page.locator('[data-testid="annular-reference-row"][data-state="match"]')).toHaveCount(4);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'progress');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
});
