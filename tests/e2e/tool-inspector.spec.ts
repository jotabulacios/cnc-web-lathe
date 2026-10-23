import { test, expect, type Page } from '@playwright/test';
import { tab } from './workbench';

const program = `G21 G18 G98
T0101
S1000 M03
G00 X50 Z2
T0505
G00 X60 Z5
M05
M30`;

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
const inspector = (page: Page) => page.getByTestId('tool-inspector');
const preview = (page: Page) => page.locator('.tool-preview canvas');

async function prepare(page: Page) {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(program);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}
async function context(page: Page) {
  // The editor and the tool catalogue live in different workbench tabs; end on Herramientas.
  await tab(page, 'Programa');
  const source = await page.getByRole('textbox', { name: 'Programa G-code' }).inputValue();
  await tab(page, 'Herramientas');
  return {
    source,
    blocks: await page.getByTestId('block-count').textContent(),
    tool: await page.getByTestId('dro-tool-code').textContent(),
    setupTool: await page.getByTestId('setup-tool-label').textContent(),
    initial: await page.getByRole('button', { name: /como herramienta inicial/, pressed: true }).getAttribute('aria-label'),
    x: await page.getByTestId('dro-x').textContent(),
    z: await page.getByTestId('dro-z').textContent(),
  };
}

test('inspector is closed by default, follows T and retreat, and local inspection leaves execution untouched', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await prepare(page);
  await expect(inspector(page)).toHaveCount(0);
  await expect(preview(page)).toHaveCount(0);

  await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
  await expect(inspector(page)).toHaveAttribute('data-tool-id', 'generic-od');
  await expect(inspector(page)).toHaveAttribute('data-following-active', 'true');
  await expect(preview(page)).toHaveAttribute('data-tool-id', 'generic-od');
  await expect(preview(page)).toHaveAttribute('data-camera', 'orthographic');

  await next(page); await next(page);
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0101');
  await expect(inspector(page)).toHaveAttribute('data-tool-id', 'roughing-od');
  await expect(preview(page)).toHaveAttribute('data-tool-id', 'roughing-od');
  await expect(page.getByTestId('inspector-overall').locator('td')).toHaveText(['Envolvente', '14', '65', '16']);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(inspector(page)).toHaveAttribute('data-tool-id', 'generic-od');
  await next(page);

  const before = await context(page);
  await page.getByLabel('Herramienta a inspeccionar').selectOption('boring-id');
  await expect(inspector(page)).toHaveAttribute('data-tool-id', 'boring-id');
  await expect(inspector(page)).toHaveAttribute('data-following-active', 'false');
  await expect(page.getByTestId('inspector-title')).toContainText('solo inspección local');
  await expect(preview(page)).toHaveAttribute('data-tool-id', 'boring-id');
  const bounds = JSON.parse(await preview(page).getAttribute('data-tool-body-bounds') ?? '[]') as number[];
  expect(bounds.map(n => Math.round(n * 1e4) / 1e4)).toEqual([0, 64, -10, 0, -8, 0]);
  await expect(page.getByTestId('inspector-silhouette')).toBeVisible();
  await expect(page.getByTestId('inspector-overall').locator('td')).toHaveText(['Envolvente', '64', '10', '8']);
  for (const [label, view] of [['Frente Z/R', 'front'], ['Planta Z/tangencial', 'top'], ['Isométrica', 'iso']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(preview(page)).toHaveAttribute('data-view', view);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Girar vista previa' }).click();
  await expect(preview(page)).toHaveAttribute('data-view', 'custom');
  await expect(page.getByRole('button', { name: 'Isométrica', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await context(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Siguiente bloque', exact: true })).toBeEnabled();

  // Local inspection persists while execution advances; the active T changes underneath.
  await next(page); await next(page); await next(page);
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0505');
  await page.getByLabel('Herramienta a inspeccionar').selectOption('grooving-od');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0505');
  await page.getByLabel('Herramienta a inspeccionar').selectOption('active');
  await expect(inspector(page)).toHaveAttribute('data-tool-id', 'boring-id');

  await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
  await expect(inspector(page)).toHaveCount(0);
  await expect(preview(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('inspector preview coexists with the main 3D view and releases its context on close', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(page.locator('.three-view canvas')).toHaveAttribute('data-profile-blocks', '0');
  await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
  await expect(preview(page)).toHaveAttribute('data-tool-id', 'generic-od');
  await expect(page.locator('canvas')).toHaveCount(2);
  await next(page); await next(page);
  await expect(page.locator('.three-view canvas')).toHaveAttribute('data-tool-id', 'roughing-od');
  await expect(preview(page)).toHaveAttribute('data-tool-id', 'roughing-od');
  await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
  await expect(page.locator('canvas')).toHaveCount(1);
  // Repeated open/close must release each preview context without starving the main view.
  for (let i = 0; i < 8; i++) {
    await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
    await expect(preview(page)).toHaveAttribute('data-tool-id', 'roughing-od');
    await tab(page, 'Herramientas').then(() => page.locator('.tool-inspector summary').click());
    await expect(page.locator('canvas')).toHaveCount(1);
  }
  await next(page);
  await expect(page.locator('.three-view canvas')).toHaveAttribute('data-profile-blocks', '3');
  await expect(page.locator('.three-view [role=alert]')).toHaveCount(0);
});
