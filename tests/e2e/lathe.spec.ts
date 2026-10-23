import { test, expect, type Page } from '@playwright/test';
import { tab } from './workbench';

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente bloque', exact: true });
const compile = (page: Page) => page.getByRole('button', { name: /Interpretar programa/ }).click();
async function at(page: Page, cursor: number, total = 13) {
  await expect(page.getByTestId('block-count')).toHaveText(`${cursor} / ${total}`);
  await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
}
async function steps(page: Page, count: number) {
  for (let i = 0; i < count; i++) await next(page).click();
}
async function measures(page: Page) {
  await tab(page, 'Pieza');
  const details = page.locator('.profile-details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr').allTextContents();
}
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('real WASM: analytical steps, rewind, reset, spindle and program end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await compile(page);
  await at(page, 0);
  await steps(page, 5);
  await at(page, 5);
  expect(await measures(page)).toEqual(['-100-4050', '-40040']);
  await expect(page.getByTestId('dro-x')).toHaveText('40.000');
  await expect(page.getByTestId('dro-z')).toHaveText('-40.000');
  await steps(page, 4);
  await at(page, 9);
  expect(await measures(page)).toEqual(['-100-4050', '-40-2040', '-20030']);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await at(page, 8);
  expect(await measures(page)).toEqual(['-100-4050', '-40040']);
  await steps(page, 5);
  await at(page, 13);
  await expect(page.getByText('Programa finalizado', { exact: true })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('.spindle-reading')).toContainText('Detenido');
  await page.getByRole('button', { name: 'Reiniciar ejecución' }).click();
  await at(page, 0);
  expect(await measures(page)).toEqual(['-100050']);
  await expect(page.getByTestId('dro-x')).toHaveText('60.000');
  await expect(page.getByTestId('dro-z')).toHaveText('5.000');
  expect(errors).toEqual([]);
});

test('editing invalidates execution and unsupported instructions block it', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await steps(page, 3);
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('G76 X10');
  await expect(next(page)).toBeDisabled();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await compile(page);
  await expect(page.getByRole('list', { name: 'Diagnósticos' })).toContainText('L1:');
  await expect(page.getByText('Revisar programa', { exact: true })).toBeVisible();
  await expect(next(page)).toBeDisabled();
});

test('setup validation blocks compilation and valid changes require reinterpretation', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await tab(page, 'Pieza');
  const diameter = page.getByLabel('Diámetro de la pieza', { exact: true });
  await diameter.fill('0');
  await expect(diameter).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: /Interpretar programa/ })).toBeDisabled();
  await expect(next(page)).toBeDisabled();
  await diameter.fill('60');
  await compile(page);
  await at(page, 0);
  expect(await measures(page)).toEqual(['-100060']);
});

test('profile stops at unsupported cutting but interpreted movement remains available', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('S1200 M03\nG00 X40 Z0\nG01 Z-20 F100\nX30\nM30');
  await compile(page);
  await at(page, 0, 5);
  await steps(page, 4);
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await expect(page.locator('.profile-warning')).toContainText('L4 · UNSUPPORTED_PROFILE_CUT');
  await page.getByRole('button', { name: /Ubicar UNSUPPORTED_PROFILE_CUT en línea 4,/ }).click();
  await expect(page.getByRole('textbox', { name: 'Programa G-code' })).toBeFocused();
  await expect(page.locator('.code-highlight [data-line="4"]')).toHaveAttribute('data-diagnostic', 'warning');
  await expect(page.getByTestId('dro-x')).toHaveText('30.000');
  expect(await measures(page)).toEqual(['-100-2050', '-20040']);
  await next(page).click();
  await expect(page.getByTestId('block-count')).toHaveText('5 / 5');
});

test('failed WASM download is visible and retry recovers without a page reload', async ({ page }) => {
  await page.route('**/cnc_wasm_bg.wasm', route => route.abort());
  await compile(page);
  await expect(page.locator('.engine-error[role=alert]')).toContainText('No se pudo preparar el programa');
  await expect(next(page)).toBeDisabled();
  await page.unroute('**/cnc_wasm_bg.wasm');
  await compile(page);
  await at(page, 0);
  await expect(page.locator('.engine-error[role=alert]')).toHaveCount(0);
});

test('failed JS loader download can be retried without reloading the page', async ({ page }) => {
  await page.route('**/cnc_wasm.js*', route => route.abort());
  await compile(page);
  await expect(page.locator('.engine-error[role=alert]')).toBeVisible();
  await page.unroute('**/cnc_wasm.js*');
  await compile(page);
  await at(page, 0);
});

test('editing during WASM load discards the obsolete compilation', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/cnc_wasm_bg.wasm', async route => {
    requested();
    await gate;
    await route.continue();
  });
  await compile(page);
  await started;
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('G00 X70 Z8\nM30');
  const downloaded = page.waitForResponse('**/cnc_wasm_bg.wasm');
  release();
  await downloaded;
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await expect(next(page)).toBeDisabled();
  await compile(page);
  await at(page, 0, 2);
  await next(page).click();
  await at(page, 1, 2);
  await expect(page.getByTestId('dro-x')).toHaveText('70.000');
});

test('automatic playback pauses, changes speed, resumes and stops at M30', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await page.clock.install();
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  for (let cursor = 1; cursor <= 2; cursor++) {
    await page.clock.runFor(1000);
    await at(page, cursor);
  }
  await page.getByRole('button', { name: 'Pausar ejecución', exact: true }).click();
  await page.clock.runFor(5000);
  await at(page, 2);
  await page.getByRole('combobox', { name: 'Velocidad de reproducción' }).selectOption('4');
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  for (let cursor = 3; cursor <= 13; cursor++) {
    await page.clock.runFor(250);
    await at(page, cursor);
  }
  await expect(page.getByRole('button', { name: 'Pausar ejecución', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeDisabled();
  expect(await measures(page)).toEqual(['-100-4050', '-40-2040', '-20030']);
});

test('manual stepping, reset and editing cancel pending automatic steps', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await page.clock.install();
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  await next(page).click();
  await at(page, 1);
  await page.clock.runFor(5000);
  await at(page, 1);
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar ejecución' }).click();
  await at(page, 0);
  await page.clock.runFor(5000);
  await at(page, 0);
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('M30');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await expect(next(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pausar ejecución', exact: true })).toHaveCount(0);
});

test('automatic playback pauses at a partial profile and allows manual inspection', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('S1200 M03\nG00 X40 Z0\nG01 Z-20 F100\nX30\nM30');
  await compile(page);
  await at(page, 0, 5);
  await page.clock.install();
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  for (let cursor = 1; cursor <= 3; cursor++) {
    await page.clock.runFor(1000);
    await at(page, cursor, 5);
  }
  await page.clock.runFor(1000);
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('block-count')).toHaveText('4 / 5');
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeDisabled();
  await next(page).click();
  await expect(page.getByTestId('block-count')).toHaveText('5 / 5');
});

test('changing speed while running reschedules the tick and setup edits pause execution', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await page.clock.install();
  await page.getByRole('button', { name: 'Reproducir programa', exact: true }).click();
  await page.getByRole('combobox', { name: 'Velocidad de reproducción' }).selectOption('4');
  await page.clock.runFor(250);
  await at(page, 1);
  await tab(page, 'Pieza');
  await page.getByLabel('Longitud de la pieza', { exact: true }).fill('120');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await expect(page.getByRole('button', { name: 'Reproducir programa', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pausar ejecución', exact: true })).toHaveCount(0);
});

test('3D consumes the actual profile through steps, rewind, reset and repeated toggles', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '0');
  await expect(canvas).toHaveAttribute('data-tool-x', '60');
  await expect(canvas).toHaveAttribute('data-tool-z', '5');
  await expect(canvas).toHaveAttribute('data-tool-visible', 'true');
  const initialVolume = Number(await canvas.getAttribute('data-profile-volume'));
  expect(Math.abs(initialVolume - Math.PI * 62500)).toBeLessThan(1e-8);
  await steps(page, 5);
  await at(page, 5);
  await expect(canvas).toHaveAttribute('data-profile-blocks', '5');
  await expect(canvas).toHaveAttribute('data-tool-x', '40');
  await expect(canvas).toHaveAttribute('data-tool-z', '-40');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBeLessThan(initialVolume);
  await page.getByRole('button', { name: 'Girar vista a la derecha', exact: true }).click();
  await page.getByRole('button', { name: 'Acercar pieza', exact: true }).click();
  await page.getByRole('button', { name: 'Restablecer cámara', exact: true }).click();
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await at(page, 4);
  await expect(canvas).toHaveAttribute('data-profile-blocks', '4');
  await expect(canvas).toHaveAttribute('data-tool-z', '2');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBe(initialVolume);
  await page.getByRole('button', { name: 'Reiniciar ejecución' }).click();
  await at(page, 0);
  await expect(canvas).toHaveAttribute('data-profile-blocks', '0');
  await expect(canvas).toHaveAttribute('data-tool-x', '60');
  await expect(canvas).toHaveAttribute('data-tool-z', '5');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
    await expect(page.locator('.three-surface canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
    await expect(canvas).toBeVisible();
    await expect(page.locator('.three-surface canvas')).toHaveCount(1);
  }
});

test('3D identifies the frozen profile and recovers after a lost graphics context', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('S1200 M03\nG00 X40 Z0\nG01 Z-20 F100\nX30\nM30');
  await compile(page);
  await at(page, 0, 5);
  await steps(page, 4);
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '3');
  await expect(page.locator('.three-caption')).toContainText('Perfil parcial confirmado hasta el bloque 3');
  await canvas.evaluate(element => {
    const extension = (element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is required for this regression');
    extension.loseContext();
  });
  await expect(page.locator('.three-view [role=alert]')).toContainText('Se perdió el contexto gráfico');
  await page.getByRole('button', { name: 'Reintentar vista 3D', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '3');
});

test('failed 3D module download preserves the usable 2D laboratory', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  await page.route('**/_next/static/chunks/*.js', route => route.abort());
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(page.locator('.three-view [role=alert]')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a 2D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vista 2D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await next(page).click();
  await at(page, 1);
});

test('leaving 3D during module loading cannot attach a stale scene after editing the cursor', async ({ page }) => {
  await compile(page);
  await at(page, 0);
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    requested();
    await gate;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
    await started;
    await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
    await next(page).click();
    await at(page, 1);
  } finally { release(); }
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks', '1');
  await expect(page.locator('.three-surface canvas')).toHaveCount(1);
});

test('guided cylinder confirms only the current full walkthrough and revokes on rewind/edit', async ({ page }) => {
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('straight');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'pending');
  await compile(page);
  await at(page, 0, 9);
  await steps(page, 9);
  await at(page, 9, 9);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'complete');
  expect(await measures(page)).toEqual(['-100-6050', '-60040']);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'progress');
  await tab(page, 'Programa');
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill('G76 X10');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'modified');
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Restaurar ejemplo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Programa G-code' })).toHaveValue(/Z-60/);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'pending');
});

test('guided loading preserves invalid drafts and recovery can itself be undone', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  const custom = 'G00 X70 Z8\nM30\n';
  await editor.fill(custom);
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro de la pieza', { exact: true }).fill('pendiente');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('incremental');
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(/G01 U-14 F100/);
  await compile(page);
  await at(page, 0, 9);
  await steps(page, 4);
  await at(page, 4, 9);
  await expect(page.getByTestId('dro-x')).toHaveText('40.000');
  await expect(page.getByTestId('dro-z')).toHaveText('2.000');
  await next(page).click();
  await at(page, 5, 9);
  await expect(page.getByTestId('dro-z')).toHaveText('-30.000');
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  // An invalid recovered draft brings the Pieza tab forward; the editor lives in Programa.
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await expect(page.getByLabel('Diámetro de la pieza', { exact: true })).toHaveValue('pendiente');
  await expect(page.getByRole('button', { name: /Interpretar programa/ })).toBeDisabled();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(editor).toHaveValue(/G01 U-14 F100/);
  await expect(page.getByLabel('Diámetro de la pieza', { exact: true })).toHaveValue('50');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state', 'pending');
});

test('reloading an unchanged exercise keeps the previous custom program recoverable', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill('G00 X80 Z9');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox', { name: 'Elegí un ejemplo', exact: true }).selectOption('straight');
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await page.getByRole('button', { name: 'Cargar ejemplo', exact: true }).click();
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(editor).toHaveValue('G00 X80 Z9');
});

for (const asset of ['cnc_wasm_bg.wasm', 'cnc_wasm.js*']) {
  test(`a hung ${asset} download times out and a later attempt can execute`, async ({ page }) => {
    await page.clock.install();
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { requested = resolve; });
    const pattern = `**/${asset}`;
    await page.route(pattern, async route => {
      requested();
      await gate;
      await route.continue().catch(() => {}); // An aborted binary request is expected.
    });
    try {
      await compile(page);
      await started;
      await page.clock.runFor(20_001);
      await expect(page.locator('.engine-error[role=alert]')).toContainText('tardó demasiado');
      await expect(next(page)).toBeDisabled();
      await page.unroute(pattern);
      await compile(page);
      await at(page, 0);
      await next(page).click();
      await at(page, 1);
    } finally { release(); }
    await page.waitForLoadState('networkidle');
    await at(page, 1);
  });
}

