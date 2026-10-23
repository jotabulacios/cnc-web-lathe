import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {benchmarkCases} from '../../scripts/benchmark-cases.mjs';

type Probe={start:number;gaps:number[];tasks:number[];stop:boolean;observer:PerformanceObserver|null};
type ProbeWindow=Window&{cncProbe?:Probe};
for(const item of benchmarkCases.filter(c=>['air-100','air-1000','air-9000','contour-1000'].includes(c.id))) {
  test(`measure browser engine and actual editor workflow: ${item.id}`,async({page},info)=>{
    await page.goto('./');
    await expect(page.getByRole('textbox',{name:'Programa G-code'})).toBeEditable();
    const engine=await page.evaluate(async({item,base})=>{
      const wasm=await import(`${base}/wasm/v1/cnc_wasm.js`);
      const response=await fetch(`${base}/wasm/v1/cnc_wasm_bg.wasm`);
      if(!response.ok)throw new Error('Missing benchmark WASM');
      const initialized=await wasm.default({module_or_path:await response.arrayBuffer()});
      const program={apiVersion:1,dialect:'edu-lathe-v1',sourceRevision:7,setup:item.setup,source:item.source};
      const samples=[];
      let last;
      for(let i=0;i<9;i++){
        const queued=performance.now();
        const tick=new Promise<number>(resolve=>setTimeout(()=>resolve(performance.now()-queued),0));
        const start=performance.now();
        const result=wasm.compile(program);
        const compiled=performance.now();
        if(!result.executable)throw new Error('Benchmark program failed to compile');
        const profile=wasm.stock_profile_v2({program,completedBlocks:result.blocks.length});
        const profiled=performance.now();
        structuredClone(result);
        const cloned=performance.now();
        const eventLoopDelayMs=await tick;
        if(i>=2)samples.push({compileMs:compiled-start,profileIncludingRecompileMs:profiled-compiled,cloneMs:cloned-profiled,eventLoopDelayMs});
        last={blocks:result.blocks.length,motions:result.motions.length,spans:profile.spans.length,
          complete:profile.complete,evaluatedBlocks:profile.evaluatedBlocks,diagnostics:profile.diagnostics.map((d:{code:string})=>d.code)};
      }
      return {userAgent:navigator.userAgent,wasmLinearMemoryBytes:initialized.memory?.buffer.byteLength??null,...last,samples};
    },{item,base:process.env.NEXT_PUBLIC_BASE_PATH??''});
    await page.getByRole('button',{name:/Pieza y origen/}).click();
    await page.getByLabel('Longitud de la pieza',{exact:true}).fill(String(item.setup.stock.lengthMm));
    await page.getByRole('button',{name:/Pieza y origen/}).click();
    await page.evaluate(()=>{
      const state:Probe={start:performance.now(),gaps:[],tasks:[],stop:false,observer:null};
      (window as ProbeWindow).cncProbe=state;
      if(PerformanceObserver.supportedEntryTypes.includes('longtask')){
        state.observer=new PerformanceObserver(list=>state.tasks.push(...list.getEntries().map(e=>e.duration)));
        state.observer.observe({entryTypes:['longtask']});
      }
      let previous=performance.now();
      const frame=(now:number)=>{state.gaps.push(now-previous);previous=now;if(!state.stop)requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
    });
    const inputMethod=process.env.CNC_BENCH_INPUT??'import';
    if(inputMethod==='fill') await page.getByRole('textbox',{name:'Programa G-code'}).fill(item.source);
    else {
      await page.locator('.project-actions>summary').click();
      await page.getByLabel('Archivo de programa G-code',{exact:true}).setInputFiles({name:'benchmark.nc',mimeType:'text/plain',buffer:Buffer.from(item.source)});
      await expect(page.getByTestId('project-notice')).toContainText('Programa abierto');
    }
    await page.getByRole('button',{name:/Interpretar programa/}).click();
    await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
    await expect(page.getByTestId('block-count')).toHaveText(`0 / ${engine.blocks}`);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const ui=await page.evaluate(()=>{
      const state=(window as ProbeWindow).cncProbe!;
      state.stop=true;
      state.tasks.push(...(state.observer?.takeRecords().map(e=>e.duration)??[]));
      state.observer?.disconnect();
      return {editToReadyMs:performance.now()-state.start,maxFrameGapMs:Math.max(0,...state.gaps),
        longTaskCount:state.tasks.length,maxLongTaskMs:Math.max(0,...state.tasks),longTaskTotalMs:state.tasks.reduce((a,b)=>a+b,0)};
    });
    const report={case:item.id,inputMethod,sourceBytes:Buffer.byteLength(item.source),engine,ui,
      note:'One UI sample includes input via selected method, React/SVG rendering, validation, compile and profile at block 0. Engine has 2 warmups plus 7 samples. No hardware-dependent timing assertions.'};
    await info.attach('measurements',{body:JSON.stringify(report,null,2),contentType:'application/json'});
    const dir=process.env.CNC_BENCH_REPORT_DIR;
    if(dir){await mkdir(dir,{recursive:true});await writeFile(join(dir,`browser-${item.id}.json`),JSON.stringify(report,null,2)+'\n');}
  });
}
