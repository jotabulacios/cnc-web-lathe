import{test,expect,type Page}from'@playwright/test';
import { tab } from './workbench';
async function load(page:Page,id:string){
  await page.goto('./');
  await tab(page, 'Prácticas');
  await page.getByRole('combobox',{name:'Elegí un ejemplo',exact:true}).selectOption(id);
  await page.getByRole('button',{name:'Cargar ejemplo',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','pending');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}
async function step(page:Page){await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();}

test('guided circular profile confirms analytical references, shows tolerances and revokes after rewind or edit',async({page})=>{
  await load(page,'arc-convex');
  await page.locator('.practice-references>summary').click();
  await expect(page.getByRole('table',{name:'Cotas de referencia del ejemplo'}).locator('tbody tr')).toHaveCount(7);
  await expect(page.locator('.practice-references')).toContainText('tolerancia ±20 mm³');
  for(let i=0;i<9;i++)await step(page);
  await expect(page.getByTestId('block-count')).toHaveText('9 / 9');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 9');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0202');
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toHaveAttribute('data-profile-blocks','9');
  const analytical=Math.PI*(56250+5000/3+500*Math.PI);
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-analytical)).toBeLessThan(20);
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','progress');
  await step(page);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
  await tab(page, 'Programa');
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  await editor.fill(await editor.inputValue()+'; práctica\n');
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','modified');
});

test('guided facing and turning teaches both tools and confirms the new face with exact remaining volume',async({page})=>{
  await load(page,'facing-turning');
  for(let i=0;i<5;i++)await step(page);
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0404');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 5');
  await tab(page, 'Pieza');
  await page.locator('.profile-details>summary').click();
  const rows=page.getByRole('table',{name:'Medidas del perfil calculado'}).locator('tbody tr');
  await expect(rows).toHaveText(['-100-150','-100']);
  for(let i=5;i<7;i++)await step(page);
  await expect(page.getByTestId('dro-tool-code')).toHaveText('T0101');
  for(let i=7;i<13;i++)await step(page);
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','complete');
  await expect(rows).toHaveText(['-100-2050','-20-140','-100']);
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toHaveAttribute('data-profile-blocks','13');
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-Math.PI*57600)).toBeLessThan(1e-7);
  await page.getByRole('button',{name:'Reiniciar ejecución',exact:true}).click();
  await expect(page.getByTestId('exercise-status')).toHaveAttribute('data-state','progress');
  await expect(canvas).toHaveAttribute('data-profile-blocks','0');
});
