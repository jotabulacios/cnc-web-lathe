import {test,expect} from '@playwright/test';
import { tab } from './workbench';
import {readFile} from 'node:fs/promises';

test('a 9000-line NC file stays complete while diagnostic navigation and resizing keep a bounded editor',async({page})=>{
  await page.goto('./');
  await page.addStyleTag({content:'.code-input::-webkit-scrollbar,.code-highlight::-webkit-scrollbar{width:15px;height:15px;}'});
  const lines=Array.from({length:9000},(_,i)=>`; bloque ${i+1}`);
  lines[8998]=' '.repeat(160)+'\t(🛠) G76 X10';
  const source=lines.join('\n')+'\n';
  await tab(page, 'Prácticas');
  await page.getByLabel('Archivo de programa G-code',{exact:true}).setInputFiles({name:'largo.nc',mimeType:'text/plain',buffer:Buffer.from(source)});
  await expect(page.getByTestId('project-notice')).toContainText('Programa abierto');
  await tab(page, 'Programa');
  const editor=page.getByRole('textbox',{name:'Programa G-code'});
  await expect(editor).toHaveValue(source);
  expect(await page.locator('.code-highlight [data-line]').count()).toBeLessThan(100);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await page.getByRole('button',{name:/Ubicar UNSUPPORTED_CODE en línea 8999,/}).click();
  await expect(page.locator('.code-highlight [data-line="8999"]')).toHaveAttribute('data-diagnostic','error');
  await expect(page.locator('[data-gutter-line="8999"]')).toBeAttached();
  for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(async()=>editor.evaluate((el:HTMLTextAreaElement)=>{
      const root=el.closest('.code-editor')!;
      return root.querySelector('.code-highlight')!.scrollTop===el.scrollTop&&root.querySelector('.code-highlight')!.scrollLeft===el.scrollLeft&&root.querySelector('.code-gutter')!.scrollTop===el.scrollTop;
    })).toBe(true);
    await expect.poll(async()=>editor.evaluate((el:HTMLTextAreaElement)=>{
      const root=el.closest('.code-editor')!;
      const line = root.querySelector('[data-line="8999"]');
      const gutter = root.querySelector('[data-gutter-line="8999"]');
      // Resize can replace the virtual row for a frame. Keep polling until
      // both current rows exist and their actual positions agree.
      return line && gutter ? Math.abs(line.getBoundingClientRect().top-gutter.getBoundingClientRect().top) : Infinity;
    })).toBeLessThan(1);
    const state=await editor.evaluate((el:HTMLTextAreaElement)=>{
      const root=el.closest('.code-editor')!;
      return {top:el.scrollTop,left:el.scrollLeft,highlightTop:root.querySelector('.code-highlight')!.scrollTop,
        highlightLeft:root.querySelector('.code-highlight')!.scrollLeft,gutter:root.querySelector('.code-gutter')!.scrollTop,
        selected:el.value.slice(el.selectionStart,el.selectionEnd),count:root.querySelectorAll('[data-line]').length};
    });
    expect(state.top).toBeGreaterThan(100_000);expect(state.left).toBeGreaterThan(0);
    expect(state.highlightTop).toBe(state.top);expect(state.highlightLeft).toBe(state.left);expect(state.gutter).toBe(state.top);
    expect(state.selected).toBe('G76');expect(state.count).toBeLessThan(100);
  }
  await tab(page, 'Prácticas');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar programa .nc',exact:true}).click();
  const file=await download;
  expect(await readFile((await file.path())!,'utf8')).toBe(source);
  await tab(page, 'Programa');
  await editor.fill('G00 X60 Z5\nM30');
  await expect(page.locator('.code-highlight [data-line="1"]')).toBeAttached();
  await expect(page.locator('.code-highlight [data-line="8999"]')).toHaveCount(0);
  await page.getByRole('button',{name:/Interpretar programa/}).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
});
