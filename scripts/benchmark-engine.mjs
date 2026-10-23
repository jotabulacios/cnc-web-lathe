import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { createHash } from 'node:crypto';
import { benchmarkCases } from './benchmark-cases.mjs';
import { resultSchema } from '../src/lib/lathe/contract.ts';
import { stockProfileV2Schema } from '../src/lib/lathe/profile.ts';
import { profileVolumeMm3 } from '../src/lib/lathe/profileMeasures.ts';
const url=new URL('../public/wasm/v1/cnc_wasm.js',import.meta.url);
const wasm=await import(url.href);
const binary=readFileSync(new URL('../public/wasm/v1/cnc_wasm_bg.wasm',import.meta.url));
const initialized=await wasm.default({module_or_path:binary});
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const reports=[];
for(const item of benchmarkCases) {
  const request={apiVersion:1,dialect:'edu-lathe-v1',sourceRevision:1,source:item.source,setup:item.setup};
  const samples=[];
  let summary;
  for(let i=0;i<9;i++){
    const a=performance.now();
    const raw=wasm.compile(request);
    const b=performance.now();
    const result=resultSchema.parse(raw);
    const c=performance.now();
    assert.equal(result.executable,true,item.id);
    const rawProfile=wasm.stock_profile_v2({program:request,completedBlocks:result.blocks.length});
    const d=performance.now();
    const profile=stockProfileV2Schema.parse(rawProfile);
    const e=performance.now();
    const copy=structuredClone(raw);
    const f=performance.now();
    assert.equal(copy.blocks.length,result.blocks.length);
    assert.equal(profile.sourceRevision,1);
    assert.equal(profile.spans[0].zStartMm,-item.setup.stock.lengthMm);
    assert.equal(profile.spans.at(-1).zEndMm,0);
    const volume=profileVolumeMm3(profile.spans);
    assert.ok(volume!==null&&volume>0);
    // Each one-millimeter alternating cone segment has the same frustum volume.
    if(profile.complete) {
      const expected=item.id.startsWith('air')?62500*Math.PI:item.count*Math.PI*(400+440+484)/3;
      assert.ok(Math.abs(volume-expected)/expected<1e-10,`${item.id}: analytical volume`);
    }
    if(!profile.complete) assert.deepEqual(profile.diagnostics.map(d=>d.code),['PROFILE_LIMIT'],`${item.id}: unexpected freeze`);
    summary={blocks:result.blocks.length,motions:result.motions.length,sourceBytes:Buffer.byteLength(item.source),
      resultJsonBytes:Buffer.byteLength(JSON.stringify(raw)),spans:profile.spans.length,complete:profile.complete,
      evaluatedBlocks:profile.evaluatedBlocks,diagnostics:profile.diagnostics.map(d=>d.code),volumeMm3:volume,
      wasmLinearMemoryBytes:initialized.memory?.buffer.byteLength??null};
    if(i>=2)samples.push({compileMs:b-a,resultValidationMs:c-b,profileIncludingRecompileMs:d-c,profileValidationMs:e-d,cloneMs:f-e});
  }
  const timings=Object.fromEntries(Object.keys(samples[0]).map(key=>[key,{p50:percentile(samples.map(s=>s[key]),.5),p95:percentile(samples.map(s=>s[key]),.95)}]));
  reports.push({id:item.id,...summary,timings,samples});
}
console.log(JSON.stringify({kind:'node-wasm-benchmark',generatedAt:new Date().toISOString(),node:process.version,
  platform:platform(),arch:arch(),cpu:cpus()[0]?.model,wasmSha256:createHash('sha256').update(binary).digest('hex'),
  warmups:2,samples:7,note:'WASM timings include JS serialization. Profile export recompiles the source. Linear memory is a high-water allocation, not live JS heap.',reports},null,2));
