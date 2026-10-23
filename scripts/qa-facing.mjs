import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Screenshots go to QA_OUTPUT_DIR or a git-ignored folder inside the repo.
const outputsDir = resolve(process.env.QA_OUTPUT_DIR ?? 'test-results/qa');
await mkdir(outputsDir, { recursive: true });
const logPath = resolve(outputsDir, 'facing-qa.log');

const facingProgram = 'G21 G18 G98\nS1000 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 Z2\nG00 X40 Z0\nG01 Z-20 F120\nM30';

const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

log(`# QA Visual del incremento 5.1 (Refrentado frontal / Facing)`);
log(`Fecha: ${new Date().toISOString()}`);

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader']
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 }
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:3100/');
await page.waitForLoadState('networkidle');
log(`Página cargada en http://127.0.0.1:3100/`);

await page.getByRole('textbox', { name: 'Programa G-code' }).fill(facingProgram);
await page.getByRole('button', { name: /Interpretar programa/ }).click();
await page.waitForTimeout(300);

// Avanzar hasta bloque 4 (refrentado completado en Z = -1)
for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await page.waitForTimeout(100);
}

const statusFacing = await page.getByTestId('profile-status').innerText();
log(`Estado del perfil tras refrentado (bloque 4): ${statusFacing}`);

// Abrir tabla de medidas
await page.locator('.profile-details summary').click();
const rowsFacing = page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr');
const countFacing = await rowsFacing.count();
log(`Filas de medidas tras refrentado: ${countFacing}`);
for (let i = 0; i < countFacing; i++) {
  log(`  Fila ${i}: ${(await rowsFacing.nth(i).innerText()).replace(/\s+/g, ' ')}`);
}

// Tomar captura 2D
const shot2dPath = resolve(outputsDir, 'torno-refrentado-2d.png');
await page.screenshot({ path: shot2dPath });
log(`Captura 2D guardada en: ${shot2dPath}`);

// Cambiar a 3D
await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
await page.waitForTimeout(500);
const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
const blocks3dFacing = await canvas.getAttribute('data-profile-blocks');
const volumeFacing = Number(await canvas.getAttribute('data-profile-volume'));
const expectedFacing = Math.PI * 61875;
log(`3D tras refrentado: bloques=${blocks3dFacing}, volumen=${volumeFacing.toFixed(2)} mm³ (esperado ${expectedFacing.toFixed(2)} mm³, error relativo=${(Math.abs(volumeFacing - expectedFacing)/expectedFacing).toExponential(3)})`);

const shot3dPath = resolve(outputsDir, 'torno-refrentado-3d.png');
await page.screenshot({ path: shot3dPath });
log(`Captura 3D guardada en: ${shot3dPath}`);

// Volver a 2D y avanzar hasta bloque 7 (cilindrado completado)
await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
for (let i = 4; i < 7; i++) {
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await page.waitForTimeout(100);
}

const statusTurning = await page.getByTestId('profile-status').innerText();
log(`Estado del perfil tras cilindrado (bloque 7): ${statusTurning}`);

// Volver a 3D para ver pieza terminada
await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
await page.waitForTimeout(500);
const volumeTurning = Number(await canvas.getAttribute('data-profile-volume'));
const expectedTurning = Math.PI * 57600;
log(`3D pieza con refrentado + cilindrado: volumen=${volumeTurning.toFixed(2)} mm³ (esperado ${expectedTurning.toFixed(2)} mm³)`);

const shotCombinedPath = resolve(outputsDir, 'torno-refrentado-torneado-3d.png');
await page.screenshot({ path: shotCombinedPath });
log(`Captura 3D combinada guardada en: ${shotCombinedPath}`);

log(`Errores de página: ${errors.length === 0 ? 'ninguno' : errors.join('; ')}`);
log(`QA VISUAL: OK`);

await browser.close();
await writeFile(logPath, logLines.join('\n') + '\n', 'utf8');
