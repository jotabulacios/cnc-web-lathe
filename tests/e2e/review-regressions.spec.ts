import {test,expect,type Page} from '@playwright/test';
async function compile(page:Page,source:string,count:number) {
  await page.getByRole('textbox',{name:'Programa G-code'}).fill(source);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('block-count')).toHaveText(`0 / ${count}`);
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}
test.beforeEach(async({page})=>{await page.goto('./');});

test('a repeated facing contact executes without a spindle and retains the faced volume',async({page})=>{
  await compile(page,'S900 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 X54\nM05\nG01 X0',6);
  for(let i=0;i<6;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 6');
  await expect(page.locator('.profile-warning')).toHaveCount(0);
  await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
  await expect(canvas).toHaveAttribute('data-profile-blocks','6');
  expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-61875*Math.PI)).toBeLessThan(1e-7);
});

test('a real arc cut hidden by its chord freezes before the block with an explicit diagnostic',async({page})=>{
  for(const [prefix,code,count] of [['','SPINDLE_OFF',2],['S900 M03\n','PROFILE_NUMERICAL_AMBIGUITY',3]] as const) {
    await compile(page,prefix+'G00 X50.01 Z0\nG02 X50.01 Z-0.02 I0 K-0.01 F100',count);
    for(let i=0;i<count;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil parcial · hasta el bloque ${count-1}`);
    await expect(page.locator('.profile-warning')).toContainText(code);
    await page.getByRole('button',{name:'Pieza 3D',exact:true}).click();
    const canvas=page.getByRole('img',{name:'Pieza de torno en 3D',exact:true});
    await expect(canvas).toHaveAttribute('data-profile-blocks',String(count-1));
    expect(Math.abs(Number(await canvas.getAttribute('data-profile-volume'))-62500*Math.PI)).toBeLessThan(1e-7);
    await page.getByRole('button',{name:'Vista 2D',exact:true}).click();
  }
});

test('tool offsets are not aliased by leading zeros and an arc endpoint on X0 remains executable',async({page})=>{
  await page.getByRole('textbox',{name:'Programa G-code'}).fill('T0001\nG00 X60 Z5');
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByRole('button',{name:/Ubicar INVALID_TOOL_OFFSET/})).toBeVisible();
  await expect(page.getByRole('button',{name:'Siguiente bloque',exact:true})).toBeDisabled();
  await compile(page,'S900 M03\nG00 X2 Z0\nG02 X0 Z-0.0710678118654755 K-7.0710678118654755 F100',3);
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'Siguiente bloque',exact:true}).click();
  await expect(page.getByTestId('dro-x')).toHaveText('0.000');
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 3');
});
