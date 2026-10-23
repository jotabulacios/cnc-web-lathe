import { test, expect } from '@playwright/test';
import { tab } from './workbench';
import { readFile } from 'node:fs/promises';

const key = 'cnc-web-lathe.project.v1';
const custom = 'G00 X70 Z8\nM30\n';
function project(source = custom) {
  return JSON.stringify({ format: 'cnc-web-lathe-project', version: 1, dialect: 'edu-lathe-v1', document: {
    source, setup: { xConvention: 'diameter', toolId: 'generic-od', stock: { diameterMm: 50, lengthMm: 100 }, initialPosition: { rMm: 30, zMm: 5 } },
    draft: { diameter: '50', length: '100', initialX: '60', initialZ: '5' }, exerciseId: null,
  } });
}
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('manual local save survives reload, restores setup and requires reinterpretation', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill(custom);
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro de la pieza', { exact: true }).fill('65');
  await page.getByLabel('X inicial de la herramienta', { exact: true }).fill('80');
  await page.evaluate(() => localStorage.setItem('legacy-cnc', 'untouched'));
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Abrir guardado local', exact: true }).click();
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await expect(page.getByRole('button', { name: 'Siguiente bloque', exact: true })).toBeDisabled();
  await tab(page, 'Pieza');
  await expect(page.getByLabel('Diámetro de la pieza', { exact: true })).toHaveValue('65');
  await expect(page.getByLabel('X inicial de la herramienta', { exact: true })).toHaveValue('80');
  expect(await page.evaluate(() => localStorage.getItem('legacy-cnc'))).toBe('untouched');
});

test('downloaded JSON can be opened and the replaced document remains recoverable', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill(custom);
  await tab(page, 'Prácticas');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar proyecto JSON', exact: true }).click(),
  ]);
  const text = await readFile((await download.path())!, 'utf8');
  const saved = JSON.parse(text);
  expect(saved.format).toBe('cnc-web-lathe-project');
  expect(saved.document.source).toBe(custom);
  expect(saved.document).not.toHaveProperty('result');
  expect(saved.document).not.toHaveProperty('cursor');
  await tab(page, 'Programa');
  await editor.fill('G00 X85 Z10');
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de proyecto JSON').setInputFiles({ name: 'saved.cnc.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto abierto');
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await page.getByRole('button', { name: /Recuperar programa anterior/ }).click();
  await expect(editor).toHaveValue('G00 X85 Z10');
});

test('invalid and oversized files retain the current source and compiled cursor', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill(custom);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await tab(page, 'Prácticas');
  const input = page.getByLabel('Archivo de proyecto JSON');
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByTestId('project-notice')).toContainText('JSON válido');
  await input.setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  await expect(page.getByTestId('project-notice')).toContainText('2 MiB');
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await expect(page.getByTestId('block-count')).toHaveText('1 / 2');
});

test('storage quota failure leaves the editor usable and JSON download available', async ({ page }) => {
  await page.addInitScript(storageKey => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === storageKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, key);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill(custom);
  await tab(page, 'Prácticas');
  await page.getByRole('button', { name: 'Guardar en este navegador', exact: true }).click();
  await expect(page.getByTestId('project-notice')).toContainText('No se pudo guardar');
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(custom);
  await tab(page, 'Prácticas');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar proyecto JSON', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('torno-proyecto.cnc.json');
});

test('a delayed file read cannot overwrite an edit made after choosing the file', async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.text;
    File.prototype.text = function() {
      return new Promise<string>((resolve, reject) => {
        (window as Window & { releaseProjectRead?: () => void }).releaseProjectRead = () => {
          void original.call(this).then(resolve, reject);
        };
      });
    };
  });
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de proyecto JSON').setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(project()) });
  await expect(page.getByTestId('project-notice')).toContainText('Leyendo proyecto');
  await tab(page, 'Programa');
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await editor.fill('G00 X90 Z12');
  await page.evaluate(() => (window as Window & { releaseProjectRead?: () => void }).releaseProjectRead?.());
  await expect(page.getByTestId('project-notice')).toContainText('Se conservó tu edición');
  await expect(editor).toHaveValue('G00 X90 Z12');
});

test('imported bare CR lines match the visible editor and execute as separate blocks', async ({ page }) => {
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de proyecto JSON').setInputFiles({ name: 'cr.json', mimeType: 'application/json', buffer: Buffer.from(project('G00 X70 Z8\rM30\r')) });
  await tab(page, 'Programa');
  await expect(page.getByRole('textbox', { name: 'Programa G-code' })).toHaveValue('G00 X70 Z8\nM30\n');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('block-count')).toHaveText('0 / 2');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
});

test('a Rust diagnostic selects its UTF-16 word after CRLF/emoji and editing revokes the focus request', async ({ page }) => {
  const source = '; inicio\r\nG21 G18 G98\r\n(🛠) G76 X10\r\n';
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de proyecto JSON').setInputFiles({ name: 'unicode.json', mimeType: 'application/json', buffer: Buffer.from(project(source)) });
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await tab(page, 'Programa');
  await page.getByRole('button', { name: /Ubicar .* en línea 3, columna 6/ }).click();
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await expect(editor).toBeFocused();
  expect(await editor.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    return input.value.slice(input.selectionStart, input.selectionEnd);
  })).toBe('G76');
  await expect(page.locator('.code-highlight [data-line="3"]')).toHaveAttribute('data-diagnostic', 'error');
  const replacement = '; nuevo\nG21 G18 G98\nG00 X70 Z8\nM30\n';
  await editor.fill(replacement);
  await expect(page.locator('.code-highlight [data-diagnostic]')).toHaveCount(0);
  expect(await editor.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(replacement.length);
});

test('diagnostic navigation scrolls long source and synchronizes highlight and gutter', async ({ page }) => {
  const lines = Array.from({ length: 270 }, () => '; línea de práctica');
  lines[249] = 'G76 X10';
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(lines.join('\n'));
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await page.getByRole('button', { name: /Ubicar .* en línea 250,/ }).click();
  const editor = page.getByRole('textbox', { name: 'Programa G-code' });
  await expect(editor).toBeFocused();
  const scroll = await editor.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    const root = input.closest('.code-editor')!;
    return { input: input.scrollTop, highlight: root.querySelector('.code-highlight')!.scrollTop,
      gutter: root.querySelector('.code-gutter')!.scrollTop, selection: input.value.slice(input.selectionStart, input.selectionEnd) };
  });
  expect(scroll.input).toBeGreaterThan(0);
  expect(scroll.highlight).toBe(scroll.input);
  expect(scroll.gutter).toBe(scroll.input);
  expect(scroll.selection).toBe('G76');
});

test('legacy project inherits its initial tool, persists through setup edits and exports canonical draft metadata',async({page})=>{
  const legacy=JSON.parse(project());
  legacy.document.setup.toolId='roughing-od';
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de proyecto JSON').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto abierto');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0101');
  await tab(page, 'Pieza');
  await page.getByLabel('Diámetro de la pieza',{exact:true}).fill('64');
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Guardar en este navegador',exact:true}).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Abrir guardado local',exact:true}).click();
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0101');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar proyecto JSON',exact:true}).click()]);
  const saved=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(saved.document.setup.stock.diameterMm).toBe(64);
  expect(saved.document.setup.toolId).toBe('roughing-od');
  expect(saved.document.draft.toolId).toBe('roughing-od');
});
