import { test, expect } from '@playwright/test';
import { tab } from './workbench';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../../fixtures/lathe/taper-turning.nc',import.meta.url),'utf8');

test.beforeEach(async ({ page }) => { await page.goto('./'); });
test('real WASM v2 taper projects the same analytical shape in 2D and 3D through rewind and reset',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('textbox',{name:'Programa G-code'}).fill(source);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  // First roughing pass: Ø42 up to Z−29, before the cone reaches Ø42 at Z−30.
  for(let i=0;i<6;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 6');
  await tab(page, 'Pieza');
  await page.locator('.profile-details summary').click();
  const rows=page.getByRole('table',{name:'Medidas del perfil calculado'}).locator('tbody tr');
  await expect(rows).toHaveText(['-100-2950','-29042']);
  await expect(page.getByRole('img',{name:/Torno CNC · vista longitudinal/}).getByLabel('Material restante')).toHaveAttribute('d',/L /);
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toBeVisible();
  for(let i=6;i<15;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  // Block 15 finishes the cone Ø30 → Ø46: frustum over 40 mm plus Ø50 over 60 mm.
  await expect(canvas).toHaveAttribute('data-profile-blocks','15');
  const volume=Number(await canvas.getAttribute('data-profile-volume'));
  expect(Math.abs(volume-Math.PI*(625*60+40*(225+345+529)/3))).toBeLessThan(1e-7);
  await expect(canvas).toHaveAttribute('data-tool-x','46');
  await expect(canvas).toHaveAttribute('data-tool-z','-40');
  // Before the cone: two roughing steps Ø36 (Z0…−14) and Ø42 (Z−14…−29).
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks','14');
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-Math.PI*(324*14+441*15+625*71))).toBeLessThan(1e-7);
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks','15');
  expect(Number(await canvas.getAttribute('data-profile-volume'))).toBe(volume);
  for(let i=15;i<19;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 19');
  await page.getByRole('button',{name:'Reiniciar ejecución',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-profile-blocks','0');
  await expect(rows).toHaveText(['-100050']);
  expect(errors).toEqual([]);
});

test('a cone ending at the axis has finite closed 3D geometry and the analytical cone volume',async({page})=>{
  await page.getByRole('textbox',{name:'Programa G-code'}).fill('G00 X40 Z0\nG01 X0 Z-100 F120 S900 M03\nG00 X60\nZ5\nM05\nM30');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for(let i=0;i<2;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-profile-blocks','2');
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-Math.PI*40000/3)).toBeLessThan(1e-7);
  await expect(page.locator('.three-view [role=alert]')).toHaveCount(0);
});

test('numerical ambiguity freezes only the profile, retains its previous volume and explains the source block',async({page})=>{
  await page.getByRole('textbox',{name:'Programa G-code'}).fill('G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nG00 X19.999999999999996\nM30');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for(let i=0;i<2;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toHaveAttribute('data-profile-blocks','2');
  const volume=await canvas.getAttribute('data-profile-volume');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 2');
  await expect(page.locator('.profile-warning')).toContainText('PROFILE_NUMERICAL_AMBIGUITY');
  await expect(canvas).toHaveAttribute('data-profile-volume',volume!);
  await expect(page.getByRole('button',{name:'Reproducir programa',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/Ubicar PROFILE_NUMERICAL_AMBIGUITY en línea 3,/}).click();
  await expect(page.getByRole('textbox',{name:'Programa G-code'})).toBeFocused();
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('block-count')).toHaveText('4 / 4');
  await expect(canvas).toHaveAttribute('data-profile-blocks','2');
});

test('the guided cone example confirms a conical walkthrough and revokes it on rewind',async({page})=>{
  await tab(page, 'Prácticas');
  await page.getByRole('combobox',{name:'Elegí un ejemplo',exact:true}).selectOption('taper');
  await page.getByRole('button',{name:'Cargar ejemplo',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','pending');
  await tab(page, 'Programa');
  await expect(page.getByRole('textbox',{name:'Programa G-code'})).toHaveValue(/X46 Z-40/);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for(let i=0;i<19;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('block-count')).toHaveText('19 / 19');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toHaveAttribute('data-profile-blocks','19');
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-Math.PI*(625*60+40*(225+345+529)/3))).toBeLessThan(1e-7);
  // Rewinding revokes the confirmation while the interpreted walkthrough stays available.
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','progress');
  await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
});
