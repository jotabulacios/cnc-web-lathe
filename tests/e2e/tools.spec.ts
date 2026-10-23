import { test, expect } from '@playwright/test';
import { tab } from './workbench';

test('initial tool selection invalidates execution, survives saving, and is overridden by program T only after its block',async({page})=>{
  await page.getByRole('textbox',{name:'Programa G-code'}).fill('G00 X60 Z5\nT0101\nG00 X70 Z8\nM30');
  await tab(page, 'Pieza');
  await page.getByLabel('Herramienta inicial',{exact:true}).selectOption('finishing-od');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0101');
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
  await page.getByLabel('Herramienta inicial',{exact:true}).selectOption('facing-od');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0404');
  await expect(page.getByRole('button',{name:'Siguiente bloque',exact:true})).toBeDisabled();
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Guardar en este navegador',exact:true}).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Abrir guardado local',exact:true}).click();
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0404');
  await tab(page, 'Pieza');
  await expect(page.getByLabel('Herramienta inicial',{exact:true})).toHaveValue('facing-od');
});

const multiToolProgram = `G21 G18 G98
T0101 M06 (Desbaste exterior 80°)
S1000 M03
G00 X50 Z2
G01 Z-20 F120
G00 X60 Z5
T0202 (Acabado exterior 55°)
G00 X46 Z2
G01 Z-15 F80
G00 X60 Z5
T0303 M06 (Ranurado 3mm)
G00 X46 Z-10
G01 X40 F50
G00 X60 Z5
T0000 (Cancelar herramienta)
M05
M30`;

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('tool changes update DRO telemetry, viewport tool markers and 3D attributes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(multiToolProgram);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');

  // Initial tool in DRO before any blocks are stepped
  await expect(page.getByTestId('dro-tool-name')).toHaveText('Neutra (ideal)');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'generic-od');

  // Step 1: G21 G18 G98
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('block-count')).toHaveText('1 / 17');

  // Step 2: T0101 M06 (Tool change to roughing-od)
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('block-count')).toHaveText('2 / 17');
  await expect(page.getByTestId('dro-tool-name')).toHaveText('Desbaste (80°)');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'roughing-od');

  // Explanation check for tool change block
  await tab(page, 'Explicación');
  await expect(page.locator('.learning-panel h2')).toContainText('T0101 · Cambio de herramienta');
  await expect(page.getByText(/Se activa Desbaste exterior/)).toBeVisible();

  // Step until block 7: T0202 (Tool change to finishing-od)
  for (let i = 2; i < 7; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  }
  await expect(page.getByTestId('block-count')).toHaveText('7 / 17');
  await expect(page.getByTestId('dro-tool-name')).toHaveText('Acabado (55°)');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'finishing-od');

  // Step until block 11: T0303 M06 (Tool change to grooving-od)
  for (let i = 7; i < 11; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  }
  await expect(page.getByTestId('block-count')).toHaveText('11 / 17');
  await expect(page.getByTestId('dro-tool-name')).toHaveText('Ranurado (3 mm)');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'grooving-od');

  // Switch to 3D view and verify 3D tool attributes
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-tool-id', 'grooving-od');

  // Switch back to 2D
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();

  // Step until block 15: T0000 (Cancel back to generic-od)
  for (let i = 11; i < 15; i++) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  }
  await expect(page.getByTestId('block-count')).toHaveText('15 / 17');
  await expect(page.getByTestId('dro-tool-name')).toHaveText('Neutra (ideal)');
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id', 'generic-od');

  expect(errors).toEqual([]);
});

test('visible tool catalogue selects initial tools and 2D labels follow execution and rewind', async ({ page }) => {
  const source = 'T2\nG00 X60 Z5\nM30';
  await page.getByRole('textbox', { name:'Programa G-code' }).fill(source);
  await tab(page, 'Herramientas');
  for (const [station, id, name] of [
    [1,'roughing-od','Desbaste'],[2,'finishing-od','Acabado'],
    [3,'grooving-od','Ranurado'],[4,'facing-od','Refrentado'],
  ] as const) {
    const choice = page.getByRole('button', { name:new RegExp(`Usar T${station} como herramienta inicial:`) });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('tool-marker')).toHaveAttribute('data-tool-id',id);
    await expect(page.getByTestId('tool-label')).toContainText(`T${station} · ${name}`);
  }
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('tool-label')).toContainText('T2 · Acabado');
  await expect(page.getByRole('button',{name:/Usar T4 como herramienta inicial:/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:/Usar T2 como herramienta inicial:/})).toHaveAttribute('data-active','true');
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await expect(page.getByTestId('tool-label')).toContainText('T4 · Refrentado');
  await page.getByRole('button',{name:/Usar T1 como herramienta inicial:/}).click();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Programa');
  await expect(page.getByRole('textbox',{name:'Programa G-code'})).toHaveValue(source);
  await expect(page.getByRole('button',{name:'Siguiente bloque',exact:true})).toBeDisabled();
});

test('expanding the 2D plane enlarges the tool without changing the execution', async ({ page }) => {
  await tab(page, 'Herramientas');
  await page.getByRole('button',{name:/Usar T2 como herramienta inicial:/}).click();
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  const marker=page.getByTestId('tool-marker');
  const before=await marker.boundingBox();
  await page.getByRole('button',{name:'Ampliar plano 2D',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reducir plano 2D',exact:true})).toHaveAttribute('aria-pressed','true');
  const after=await marker.boundingBox();
  expect(after!.width).toBeGreaterThan(before!.width);
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await expect(page.getByTestId('tool-label')).toContainText('T2 · Acabado');
  await page.getByRole('button',{name:'Reducir plano 2D',exact:true}).click();
  await expect(page.getByTestId('block-count')).toHaveText('1 / 13');
});

test('dimensional tool assemblies change actual 3D bounds and rewind to the previous shape', async ({ page }) => {
  const source = 'T1\nT2\nT3\nT4\nT5\nM30';
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(source);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  const shapes = [
    ['roughing-od', 0, 14, 0, 65],
    ['finishing-od', 0, 14, 0, 60],
    ['grooving-od', -3.5, 6.5, 0, 65],
    ['facing-od', 0, 65, 0, 15],
    ['boring-id', 0, 64, -10, 0],
  ] as const;
  for (const [id, zMin, zMax, rMin, rMax] of shapes) {
    await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-tool-assembly', id);
    const world: number[] = JSON.parse((await canvas.getAttribute('data-tool-body-bounds'))!);
    // Initial reference X60/Z5 => world x=.55, y=.3; geometry is mm/100.
    const expected = [0.55 + zMin / 100, 0.55 + zMax / 100, 0.3 + rMin / 100, 0.3 + rMax / 100];
    world.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5));
    await expect(page.getByTestId('active-tool-dimensions')).toContainText(/mm/);
  }
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-tool-assembly', 'facing-od');
  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  await expect(page.getByTestId('tool-marker').locator('[data-assembly-id="facing-od"]')).toBeAttached();
});

test('tool dimensions stay in mm when the stock scale changes by three orders of magnitude', async ({ page }) => {
  await tab(page, 'Pieza');
  await page.getByLabel('Herramienta inicial', { exact: true }).selectOption('roughing-od');
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  for (const size of [1, 100, 1000]) {
    await page.getByLabel('Diámetro de la pieza', { exact: true }).fill(String(size / 2));
    await page.getByLabel('Longitud de la pieza', { exact: true }).fill(String(size));
    await page.getByLabel('X inicial de la herramienta', { exact: true }).fill(String(size * 0.6));
    await page.getByLabel('Z inicial de la herramienta', { exact: true }).fill(String(size * 0.05));
    await expect(canvas).toHaveAttribute('data-tool-scale-mm', String(size));
    await expect(canvas).toHaveAttribute('data-tool-visible', 'true');
    const bounds: number[] = JSON.parse((await canvas.getAttribute('data-tool-body-bounds'))!);
    expect((bounds[1] - bounds[0]) * size).toBeCloseTo(14, 4);
    expect((bounds[3] - bounds[2]) * size).toBeCloseTo(65, 4);
  }
});
