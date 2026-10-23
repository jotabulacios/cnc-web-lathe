import { test, expect } from '@playwright/test';

test('execution shortcuts step and rewind without editing source, and require a valid interpretation',async({page})=>{
  await page.goto('./');
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  const source='T1\nT2\nM30';
  await editor.fill(source);
  await editor.press('F8');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await editor.press('Control+Enter');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await editor.press('F8');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await expect(page.getByTestId('tool-label')).toContainText('T1 · Desbaste');
  await editor.press('F8');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 2');
  await expect(page.getByTestId('tool-label')).toContainText('T2 · Acabado');
  await editor.press('Shift+F8');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await expect(page.getByTestId('tool-label')).toContainText('T1 · Desbaste');
  await expect(editor).toHaveValue(source);
  await editor.fill('G76 X20');
  await editor.press('Control+Enter');
  await expect(page.getByRole('status').filter({hasText:'Revisar programa'})).toBeVisible();
  await editor.press('F8');
  await expect(page.getByTestId('block-count')).toHaveText(/^0 \/ /);
});

test('manual keyboard steps pause automatic playback and held keys do not repeat steps',async({page})=>{
  await page.goto('./');
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  await editor.fill('T1\nT2\nT3\nT4\nM30');
  await editor.press('Control+Enter');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  await page.clock.install();
  await page.getByRole('button',{name:'Reproducir programa',exact:true}).click();
  await page.keyboard.press('F8');
  await expect(page.getByRole('button',{name:'Reproducir programa',exact:true})).toBeVisible();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('block-count')).toHaveText('1 / 5');
  await page.keyboard.down('F8');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 2');
  await page.keyboard.down('F8');
  await page.keyboard.up('F8');
  await expect(page.getByTestId('block-count')).toHaveText('2 / 5');
});

test('the server-rendered editor waits for hydration before accepting edits',async({page})=>{
  let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/,async route=>{
    await ready;
    await route.continue();
  });
  try {
    await page.goto('./',{waitUntil:'commit'});
    const editor=page.getByRole('textbox',{name:'Programa G-code'});
    await expect(editor).toHaveAttribute('readonly','');
    await expect(editor).toHaveAttribute('aria-busy','true');
    release();
    await expect(editor).toBeEditable();
    await editor.fill('T2\nM30');
    await editor.press('Control+Enter');
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
    await editor.press('F8');
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 1');
    await expect(page.getByTestId('block-count')).toHaveText('1 / 2');
    await expect(editor).toHaveValue('T2\nM30');
  } finally { release(); }
});
