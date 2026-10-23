import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Screenshots go to QA_OUTPUT_DIR or a git-ignored folder inside the repo.
const outputsDir = resolve(process.env.QA_OUTPUT_DIR ?? 'test-results/qa');
await mkdir(outputsDir, { recursive: true });
const logPath = resolve(outputsDir, 'arcs-v2-removal-qa.log');

const convex = 'G21 G18 G98\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nM30';
const concave = 'G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30';

const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

log(`# QA Visual del incremento 4.2 (Remoción de material con arcos)`);
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

// 1. Cargar snapshot publicado en :3100
await page.goto('http://127.0.0.1:3100/');
await page.waitForLoadState('networkidle');
log(`Página cargada en http://127.0.0.1:3100/`);

// 2. Probar G03 convexo
log(`--- Caso G03 Convexo ---`);
await page.getByRole('textbox', { name: 'Programa G-code' }).fill(convex);
await page.getByRole('button', { name: /Interpretar programa/ }).click();
await page.waitForTimeout(300);

for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await page.waitForTimeout(100);
}

const statusTextG03 = await page.getByTestId('profile-status').innerText();
log(`Estado del perfil tras G03: ${statusTextG03}`);

const arcG03 = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ }).locator('path[data-arc]');
const arcKindG03 = await arcG03.getAttribute('data-arc');
const arcPathG03 = await arcG03.getAttribute('d');
log(`Arco 2D: tipo=${arcKindG03}, path=${arcPathG03}`);

// Abrir tabla de medidas
await page.locator('.profile-details summary').click();
const rowsG03 = page.getByRole('table', { name: 'Medidas del perfil calculado' }).locator('tbody tr');
const countG03 = await rowsG03.count();
log(`Filas de medidas del perfil (tramos aplanados del arco): ${countG03}`);
const lastRowG03 = await rowsG03.last().innerText();
log(`Último tramo: ${lastRowG03.replace(/\s+/g, ' ')}`);

// Tomar captura 2D
const shot2dPath = resolve(outputsDir, 'torno-arco-4.2-g03-2d.png');
await page.screenshot({ path: shot2dPath });
log(`Captura 2D guardada en: ${shot2dPath}`);

// Cambiar a 3D
await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
await page.waitForTimeout(500);
const canvasG03 = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
const blocks3d = await canvasG03.getAttribute('data-profile-blocks');
const volume3d = Number(await canvasG03.getAttribute('data-profile-volume'));
log(`3D: bloques=${blocks3d}, volumen=${volume3d.toFixed(2)} mm³`);
const expectedG03 = Math.PI * 62500 - Math.PI * (6250 - 5000 / 3 - 500 * Math.PI);
const relErr = Math.abs(volume3d - expectedG03) / expectedG03;
log(`Volumen analítico esperado=${expectedG03.toFixed(2)} mm³, error relativo=${relErr.toExponential(3)}`);

// Tomar captura 3D
const shot3dPath = resolve(outputsDir, 'torno-arco-4.2-g03-3d.png');
await page.screenshot({ path: shot3dPath });
log(`Captura 3D guardada en: ${shot3dPath}`);

// 3. Probar G02 cóncavo
log(`--- Caso G02 Cóncavo ---`);
await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
await page.getByRole('textbox', { name: 'Programa G-code' }).fill(concave);
await page.getByRole('button', { name: /Interpretar programa/ }).click();
await page.waitForTimeout(300);

for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: 'Siguiente bloque', exact: true }).click();
  await page.waitForTimeout(100);
}

const statusTextG02 = await page.getByTestId('profile-status').innerText();
log(`Estado del perfil tras G02: ${statusTextG02}`);

const arcG02 = page.getByRole('img', { name: /Torno CNC · vista longitudinal/ }).locator('path[data-arc]');
const arcKindG02 = await arcG02.getAttribute('data-arc');
log(`Arco 2D G02: tipo=${arcKindG02}`);

const shotG02Path = resolve(outputsDir, 'torno-arco-4.2-g02-2d.png');
await page.screenshot({ path: shotG02Path });
log(`Captura G02 2D guardada en: ${shotG02Path}`);

// Cambiar a 3D para G02
await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
await page.waitForTimeout(500);
const canvasG02 = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
const volume3dG02 = Number(await canvasG02.getAttribute('data-profile-volume'));
log(`3D G02: volumen=${volume3dG02.toFixed(2)} mm³`);
const shotG023dPath = resolve(outputsDir, 'torno-arco-4.2-g02-3d.png');
await page.screenshot({ path: shotG023dPath });
log(`Captura G02 3D guardada en: ${shotG023dPath}`);

log(`Errores de página: ${errors.length === 0 ? 'ninguno' : errors.join('; ')}`);
log(`QA VISUAL: OK`);

await browser.close();
await writeFile(logPath, logLines.join('\n') + '\n', 'utf8');
