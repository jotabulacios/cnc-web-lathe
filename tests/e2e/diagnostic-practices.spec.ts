import {test,expect,type Page} from '@playwright/test';
import { tab } from './workbench';
async function load(page:Page,id:string){
  await page.goto('./');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox',{name:'Elegí un ejemplo',exact:true}).selectOption(id);
  await page.getByRole('button',{name:'Cargar ejemplo',exact:true}).click();
  await page.getByRole('button',{name:/Interpretar programa/}).click();
}
async function step(page:Page,i:number){
  await tab(page, 'Programa');
  await page.getByRole('textbox',{name:'Programa G-code'}).press('F8');
  if(i<4)await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
}
test('spindle diagnostic shows the frozen prefix, navigates to the cut and loads a recoverable positive reference',async({page})=>{
  await load(page,'diagnose-spindle');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for(let i=1;i<=4;i++)await step(page,i);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','observed');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil parcial · hasta el bloque 3');
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Ubicar diagnóstico en línea 4',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  await expect(editor).toBeFocused();
  const selection=await editor.evaluate((el:HTMLTextAreaElement)=>el.value.slice(el.selectionStart,el.selectionEnd));
  expect(selection).toBe('G01 Z-20 F120');
  await editor.press('Shift+F8');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','progress');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 3');
  await step(page,4);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','observed');
  const original=await editor.inputValue();
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Cargar corrección de referencia',exact:true}).click();
  await tab(page, 'Programa');
  await expect(editor).toHaveValue(/S1000 M03/);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
  for(let i=1;i<=8;i++){
    await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
  }
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
  await page.getByRole('button',{name:'Recuperar programa anterior (incluye configuración)',exact:true}).click();
  await expect(editor).toHaveValue(original);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','pending');
});
test('unsupported diagnostic blocks buttons and F8 and loads an explicit G00/G01 reference',async({page})=>{
  await load(page,'diagnose-unsupported');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','observed');
  await expect(page.getByTestId('exercise-status')).toContainText('Diagnóstico observado');
  await expect(page.getByRole('button',{name:'Siguiente bloque',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Reproducir programa',exact:true})).toBeDisabled();
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  await tab(page, 'Programa');
  await editor.press('F8');
  await expect(page.getByTestId('block-count')).toHaveText('0 / 0');
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Ubicar diagnóstico en línea 3',exact:true}).click();
  expect(await editor.evaluate((el:HTMLTextAreaElement)=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('G76');
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Guardar en este navegador',exact:true}).click();
  await expect(page.getByTestId('project-notice')).toContainText('Proyecto guardado');
  await page.reload();
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Abrir guardado local',exact:true}).click();
  await tab(page, 'Prácticas');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','pending');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','observed');
  await tab(page, 'Programa');
  await editor.fill('G21\nG76 X20\n');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','modified');
  await tab(page, 'Prácticas');
  await page.getByRole('button',{name:'Cargar corrección de referencia',exact:true}).click();
  await tab(page, 'Programa');
  await expect(editor).not.toHaveValue(/G76/);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
});
