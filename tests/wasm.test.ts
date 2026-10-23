import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resultSchema, defaultSetup, setupSchema, type CompileRequest } from '../src/lib/lathe/contract.ts';
import { TOOL_ASSEMBLIES, partOutline } from '../src/lib/lathe/toolAssemblies.ts';
import { DEFAULT_JAW_GRIP_MM, DEFAULT_JAW_HEIGHT_MM, resolvedJaws } from '../src/lib/lathe/chuck.ts';
const moduleUrl=new URL('../public/wasm/v1/cnc_wasm.js',import.meta.url).href;
const wasm=await import(moduleUrl);
await wasm.default({module_or_path:readFileSync(new URL('../public/wasm/v1/cnc_wasm_bg.wasm',import.meta.url))});
const source=readFileSync(new URL('../fixtures/lathe/first-program.nc',import.meta.url),'utf8');
function request(text:string):CompileRequest {
  return {apiVersion:1,dialect:'edu-lathe-v1',sourceRevision:1,source:text,setup:defaultSetup};
}
test('real WASM matches the complete native Rust fixture through the JS boundary',()=>{
  const expected=JSON.parse(readFileSync(new URL('../fixtures/lathe/first-program.result.json',import.meta.url),'utf8'));
  const result=resultSchema.parse(wasm.compile(request(source)));
  for (const [i,motion] of result.motions.entries()) {
    assert.ok(Math.abs(motion.lengthMm-expected.motions[i].lengthMm)<1e-9);
    // Only derived floating lengths use a tolerance. All state and provenance is exact.
    expected.motions[i].lengthMm=motion.lengthMm;
  }
  assert.deepEqual(result,expected);
});
test('WASM emits diagnostics without executing unsupported codes',()=>{
  for(const text of ['G00 X54\nG71 X10','M123','G90','T9999','G01 X1','G00 Y1','G1.00000000000000001 X10 F100','M30.000000000000001','G+0 X10']) {
    const result=resultSchema.parse(wasm.compile(request(text)));
    assert.equal(result.executable,false,text);
    assert.equal(result.motions.length,0);
    assert.equal(result.finalState,null);
    assert.ok(result.diagnostics.some(d=>d.severity==='error'));
  }
});
test('malformed JS requests are rejected at the WASM boundary',()=>{
  assert.throws(()=>wasm.compile({}));
  const unsupportedTool=resultSchema.parse(wasm.compile({...request(source),setup:{...defaultSetup,toolId:'other'}}));
  assert.equal(unsupportedTool.executable,false);
  assert.equal(unsupportedTool.motions.length,0);
  assert.equal(unsupportedTool.diagnostics[0]?.code,'INVALID_REQUEST');
  assert.throws(()=>wasm.compile({...request(source),setup:{...defaultSetup,extra:true}}));
});

test('WASM resolves arc geometry and flattens it in v2 while legacy v1 still freezes',()=>{
  const text='G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30';
  const result=resultSchema.parse(wasm.compile(request(text)));
  assert.equal(result.executable,true);
  assert.deepEqual(result.diagnostics,[]);
  const motion=result.motions[1];
  assert.equal(motion.kind,'arc-cw');
  assert.deepEqual(motion.arc?.center,{rMm:30,zMm:-10});
  assert.ok(Math.abs((motion.arc?.radiusMm ?? 0)-10)<1e-12);
  assert.equal(motion.arc?.clockwise,true);
  assert.ok(Math.abs((motion.arc?.sweepRad ?? 0)-Math.PI/2)<1e-12);
  assert.ok(Math.abs(motion.lengthMm-5*Math.PI)<1e-9);

  const legacy=stockProfileSchema.parse(wasm.stock_profile({program:request(text),completedBlocks:5}));
  assert.equal(legacy.complete,false);
  assert.equal(legacy.evaluatedBlocks,3);
  assert.equal(legacy.diagnostics[0]?.code,'ARC_IN_PROFILE');

  const v2=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:request(text),completedBlocks:5}));
  assert.equal(v2.complete,true);
  assert.deepEqual(v2.diagnostics,[]);
  assert.equal(v2.evaluatedBlocks,5);
  assert.ok(v2.spans.length>10);
  const at=(z:number)=>{
    const span=v2.spans.find(item=>item.zStartMm<=z&&z<=item.zEndMm);
    assert.ok(span,`sin tramo para z=${z}`);
    const t=(z-span.zStartMm)/(span.zEndMm-span.zStartMm);
    return span.rStartMm*(1-t)+span.rEndMm*t;
  };
  assert.ok(Math.abs(at(-5)-(30-Math.sqrt(75)))<0.01);
  assert.ok(Math.abs(at(-50)-25)<1e-12);
});

test('WASM freezes v2 before a non-monotonic arc instead of inventing spans',()=>{
  const text='G21 G18 G98\nS900 M03\nG00 X20 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30';
  assert.equal(resultSchema.parse(wasm.compile(request(text))).executable,true);
  const v2=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:request(text),completedBlocks:5}));
  assert.equal(v2.complete,false);
  assert.equal(v2.evaluatedBlocks,3);
  assert.equal(v2.diagnostics[0]?.code,'ARC_IN_PROFILE');
  assert.equal(v2.spans.length,1);
  assert.equal(v2.spans[0]?.rStartMm,25);
});

// Geometry uses a separate versioned export; the compiler result stays unchanged.
const { stockProfileSchema, stockProfileV2Schema } = await import('../src/lib/lathe/profile.ts');
const turningSource=readFileSync(new URL('../fixtures/lathe/two-step-turning.nc',import.meta.url),'utf8');
const turningExpected=JSON.parse(readFileSync(new URL('../fixtures/lathe/two-step-turning.profile.json',import.meta.url),'utf8'));
function profile(text:string, completedBlocks:number) {
  return stockProfileSchema.parse(wasm.stock_profile({program:request(text),completedBlocks}));
}

test('additive WASM v2 produces the analytical taper at every prefix while legacy stays v1',()=>{
  const source=readFileSync(new URL('../fixtures/lathe/taper-turning.nc',import.meta.url),'utf8');
  const cone=(z:number)=>15-0.2*z; // Ø30 at Z0 → Ø46 at Z−40
  const radiusAt=(spans:{zStartMm:number;zEndMm:number;rStartMm:number;rEndMm:number}[],z:number)=>{
    const s=spans.find(s=>s.zStartMm<=z&&z<=s.zEndMm)!;
    return s.rStartMm+(z-s.zStartMm)/(s.zEndMm-s.zStartMm)*(s.rEndMm-s.rStartMm);
  };
  for(let cursor=0;cursor<=19;cursor++) {
    const value=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:request(source),completedBlocks:cursor}));
    assert.equal(value.complete,true,`@${cursor}`);
    assert.equal(value.profileVersion,2);
    assert.equal(value.sourceRevision,1);
    assert.equal(value.evaluatedBlocks,cursor);
    assert.equal(value.completedBlocks,cursor);
    // Roughing never cuts below the final cone (no gouge at any prefix).
    for(const z of [-39,-30,-20,-10,0]) assert.ok(radiusAt(value.spans,z)>=cone(z)-1e-9,`@${cursor} Z${z}`);
    if(cursor===6) assert.equal(radiusAt(value.spans,-20),21,'first roughing pass at Ø42');
  }
  const final=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:request(source),completedBlocks:19}));
  for(const z of [-39,-30,-20,-10,0]) assert.ok(Math.abs(radiusAt(final.spans,z)-cone(z))<1e-9);
  assert.equal(radiusAt(final.spans,-75),25);
  const legacy=profile(source,19);
  assert.equal(legacy.profileVersion,1);
  assert.equal(legacy.complete,false);
  assert.equal(legacy.diagnostics[0].code,'UNSUPPORTED_PROFILE_CUT');
});

test('v2 rejects malformed JS requests and exposes partial numerical failures with the prefix intact',()=>{
  const program=request('G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nG00 X19.999999999999996');
  for (const invalid of [{}, {program,completedBlocks:-1}, {program,completedBlocks:1.5},
    {program,completedBlocks:1,extra:true},{program:{...program,extra:true},completedBlocks:1}]) {
    assert.throws(()=>wasm.stock_profile_v2(invalid));
  }
  const partial=stockProfileV2Schema.parse(wasm.stock_profile_v2({program,completedBlocks:3}));
  assert.equal(partial.complete,false);
  assert.equal(partial.evaluatedBlocks,2);
  assert.equal(partial.diagnostics[0].code,'PROFILE_NUMERICAL_AMBIGUITY');
  assert.equal(partial.diagnostics[0].span.line,3);
  assert.deepEqual(partial.spans,[{zStartMm:-100,zEndMm:-60,rStartMm:25,rEndMm:25},{zStartMm:-60,zEndMm:0,rStartMm:10,rEndMm:20}]);
});
test('WASM stock profile produces exact cylinder and two analytical steps',()=>{
  const initial=profile(turningSource,0);
  assert.equal(initial.complete,true);
  assert.deepEqual(initial.spans,[{zStartMm:-100,zEndMm:0,radiusMm:25}]);
  for(const [cursor,key] of [[5,'afterFirstCut'],[9,'afterSecondCut'],[13,'afterSecondCut']] as const) {
    const result=profile(turningSource,cursor);
    assert.equal(result.complete,true);
    assert.equal(result.sourceRevision,1);
    assert.equal(result.completedBlocks,cursor);
    assert.equal(result.evaluatedBlocks,cursor);
    assert.deepEqual(result.spans,turningExpected[key]);
  }
});
test('WASM rewind and reset reconstruct the requested geometry, independently of last call',()=>{
  const final=profile(turningSource,13);
  const previous=profile(turningSource,8);
  assert.deepEqual(previous.spans,turningExpected.afterFirstCut);
  assert.deepEqual(profile(turningSource,13),final);
  assert.deepEqual(profile(turningSource,0).spans,[{zStartMm:-100,zEndMm:0,radiusMm:25}]);
});
test('unsupported cutting freezes only geometry with the exact source line',()=>{
  const before=profile(source,5);
  const after=profile(source,6);
  assert.equal(after.complete,false);
  assert.equal(after.evaluatedBlocks,5);
  assert.equal(after.diagnostics[0]?.code,'UNSUPPORTED_PROFILE_CUT');
  assert.equal(after.diagnostics[0]?.span.line,6);
  assert.deepEqual(after.spans,before.spans);
  assert.deepEqual(profile(source,9).spans,before.spans);
  assert.equal(profile(source,5).complete,true);
});
test('rapid penetration, stopped spindle and invalid cursor never fabricate a cut',()=>{
  for(const [text,cursor,code] of [
    ['G00 X40 Z-10',1,'RAPID_IN_STOCK'],
    ['G00 X40 Z0\nG01 Z-20 F100',2,'SPINDLE_OFF'],
    ['G00 X60',2,'INVALID_PROFILE_REQUEST'],
  ] as const) {
    const result=profile(text,cursor);
    assert.equal(result.complete,false);
    assert.equal(result.diagnostics[0]?.code,code);
    assert.deepEqual(result.spans,[{zStartMm:-100,zEndMm:0,radiusMm:25}]);
  }
  assert.throws(()=>wasm.stock_profile({program:request(turningSource),completedBlocks:-1}));
  assert.throws(()=>wasm.stock_profile({program:request(turningSource),completedBlocks:0,extra:true}));
});

test('all guided fixtures pass real WASM, match expected profiles and revoke confirmation on rewind', async () => {
  const { exercisesSchema, assessExercise, expectedProfileMatches } = await import('../src/lib/lathe/exercises.ts');
  const dir = new URL('../fixtures/lathe/', import.meta.url);
  const catalogue = JSON.parse(readFileSync(new URL('exercises.json', dir), 'utf8')) as Record<string, unknown>[];
  const exercises = exercisesSchema.parse(catalogue.map(e => ({ ...e, source: readFileSync(new URL(String(e.file), dir), 'utf8') })));
  for (const exercise of exercises) {
    const program = { ...request(exercise.source), setup: exercise.setup };
    const result = resultSchema.parse(wasm.compile(program));
    assert.equal(result.executable, true);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.blocks.length, exercise.blockCount);
    for (let cursor = 0; cursor <= result.blocks.length; cursor++) {
      // Follow the same profile contract as the UI for every catalogue entry.
      const profile = stockProfileV2Schema.parse(wasm.stock_profile_v2({ program, completedBlocks: cursor }));
      assert.equal(profile.complete, true, `${exercise.id} @${cursor}`);
      assert.deepEqual(profile.diagnostics, []);
      const assessment = assessExercise(exercise, { source: exercise.source, setup: exercise.setup,
        revision: 1, cursor, result, profile, profileError: null });
      assert.equal(assessment.kind, cursor === result.blocks.length ? 'complete' : 'progress');
      if (cursor === result.blocks.length) assert.equal(expectedProfileMatches(profile.spans,exercise),true,exercise.id);
    }
  }
});

test('WASM v2 executes facing cut to X0, leaves zero-radius front and legacy v1 freezes', () => {
  const text = 'G21 G18 G98\nS1000 M03\nG00 X54 Z-1\nG01 X0 F100\nM30';
  const program = request(text);
  const result = resultSchema.parse(wasm.compile(program));
  assert.equal(result.executable, true);

  const legacy = stockProfileSchema.parse(wasm.stock_profile({ program, completedBlocks: 4 }));
  assert.equal(legacy.complete, false);
  assert.equal(legacy.diagnostics[0]?.code, 'UNSUPPORTED_PROFILE_CUT');

  const v2 = stockProfileV2Schema.parse(wasm.stock_profile_v2({ program, completedBlocks: 4 }));
  assert.equal(v2.complete, true);
  assert.deepEqual(v2.diagnostics, []);
  assert.equal(v2.spans.length, 2);
  assert.deepEqual(v2.spans[0], { zStartMm: -100, zEndMm: -1, rStartMm: 25, rEndMm: 25 });
  assert.deepEqual(v2.spans[1], { zStartMm: -1, zEndMm: 0, rStartMm: 0, rEndMm: 0 });
});

test('WASM supports tool library calls, updates state modal toolId and assigns toolId to motions', () => {
  const text = 'G21 G18 G98\nT0101 M06\nS1000 M03\nG00 X40 Z2\nG01 Z-10 F120\nT0202\nG00 X38 Z2\nG01 Z-5 F80\nT0000\nM30';
  const program = request(text);
  const result = resultSchema.parse(wasm.compile(program));
  assert.equal(result.executable, true);
  assert.deepEqual(result.diagnostics, []);

  // Block 1: T0101 M06
  assert.equal(result.blocks[1].afterState.toolId, 'roughing-od');
  // Motion 0 (G00 X40 Z2) and Motion 1 (G01 Z-10) use roughing-od
  assert.equal(result.motions[0].toolId, 'roughing-od');
  assert.equal(result.motions[1].toolId, 'roughing-od');

  // Block 5: T0202
  assert.equal(result.blocks[5].afterState.toolId, 'finishing-od');
  // Motion 2 (G00 X38 Z2) and Motion 3 (G01 Z-5) use finishing-od
  assert.equal(result.motions[2].toolId, 'finishing-od');
  assert.equal(result.motions[3].toolId, 'finishing-od');

  // Block 8: T0000 cancels back to generic-od
  assert.equal(result.blocks[8].afterState.toolId, 'generic-od');
  assert.equal(result.finalState?.toolId, 'generic-od');
});

test('review regressions: tool word width and arc endpoints agree with the native contract', () => {
  for (const [source,code] of [['T0001','INVALID_TOOL_OFFSET'],['T0004','INVALID_TOOL_OFFSET'],
    ['T101','INVALID_TOOL_NUMBER'],['T00101','INVALID_TOOL_NUMBER']] as const) {
    const result=resultSchema.parse(wasm.compile(request(source)));
    assert.equal(result.executable,false,source);
    assert.equal(result.diagnostics[0].code,code,source);
    assert.deepEqual(result.motions,[]);
  }
  for(const source of ['G00 X2 Z0\nG02 X0 Z-0.0710678118654755 K-7.0710678118654755 F100',
    'G00 X2 Z0\nG03 X0 Z0.0710678118654755 K7.0710678118654755 F100']) {
    const result=resultSchema.parse(wasm.compile(request(source)));
    assert.equal(result.executable,true,JSON.stringify(result.diagnostics));
    assert.equal(result.motions.at(-1)?.to.rMm,0);
  }
});

test('review regressions: repeated facing has no removal and real arc penetration cannot be hidden by a chord', () => {
  const source='S900 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 X54\nM05\nG01 X0';
  const repeated=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:request(source),completedBlocks:6}));
  assert.equal(repeated.complete,true,JSON.stringify(repeated.diagnostics));
  assert.deepEqual(repeated.spans,[{zStartMm:-100,zEndMm:-1,rStartMm:25,rEndMm:25},{zStartMm:-1,zEndMm:0,rStartMm:0,rEndMm:0}]);
  for(const [prefix,code] of [['','SPINDLE_OFF'],['S900 M03\n','PROFILE_NUMERICAL_AMBIGUITY']] as const) {
    const text=prefix+'G00 X50.01 Z0\nG02 X50.01 Z-0.02 I0 K-0.01 F100';
    const program=request(text);
    const count=resultSchema.parse(wasm.compile(program)).blocks.length;
    const result=stockProfileV2Schema.parse(wasm.stock_profile_v2({program,completedBlocks:count}));
    assert.equal(result.complete,false);
    assert.equal(result.evaluatedBlocks,count-1);
    assert.equal(result.diagnostics[0].code,code);
    assert.deepEqual(result.spans,[{zStartMm:-100,zEndMm:0,rStartMm:25,rEndMm:25}]);
  }
});

test('guided arc confirmation rejects a reversed arc profile with the same volume',async()=>{
  const {exercisesSchema,expectedProfileMatches}=await import('../src/lib/lathe/exercises.ts');
  const {profileVolumeMm3}=await import('../src/lib/lathe/profileMeasures.ts');
  const dir=new URL('../fixtures/lathe/',import.meta.url);
  const catalogue=JSON.parse(readFileSync(new URL('exercises.json',dir),'utf8')) as Record<string,unknown>[];
  const arc=exercisesSchema.parse(catalogue.map(e=>({...e,source:readFileSync(new URL(String(e.file),dir),'utf8')}))).find(e=>e.id==='arc-convex')!;
  const profile=stockProfileV2Schema.parse(wasm.stock_profile_v2({program:{...request(arc.source),setup:arc.setup},completedBlocks:arc.blockCount}));
  assert.equal(expectedProfileMatches(profile.spans,arc),true);
  // Mirror the front zone (Z−5…0, the round) so it faces the chuck: same volume, wrong shape.
  const front=profile.spans.filter(span=>span.zStartMm>=-5);
  const rest=profile.spans.filter(span=>span.zStartMm<-5);
  const reversed=[...rest,...front.toReversed().map(span=>({zStartMm:-5-span.zEndMm,zEndMm:-5-span.zStartMm,rStartMm:span.rEndMm,rEndMm:span.rStartMm}))];
  assert.ok(Math.abs(profileVolumeMm3(reversed)!-profileVolumeMm3(profile.spans)!)<1e-6);
  assert.equal(expectedProfileMatches(reversed,arc),false);
});

test('diagnostic catalogue observes real WASM provenance, preserves prefixes and validates corrections',async()=>{
  const {practicesSchema,assessPractice,isDiagnostic}=await import('../src/lib/lathe/diagnosticExercises.ts');
  const {stockProfileV2Schema}=await import('../src/lib/lathe/profile.ts');
  const {profileVolumeMm3}=await import('../src/lib/lathe/profileMeasures.ts');
  const dir=new URL('../fixtures/lathe/',import.meta.url);
  const json=(file:string)=>JSON.parse(readFileSync(new URL(file,dir),'utf8')) as Record<string,unknown>[];
  const practices=practicesSchema.parse([...json('exercises.json'),...json('diagnostic-corrections.json'),...json('diagnostic-exercises.json')]
    .map(e=>({...e,source:readFileSync(new URL(String(e.file),dir),'utf8')})));
  for(const practice of practices.filter(isDiagnostic)){
    const program={...request(practice.source),sourceRevision:23,setup:practice.setup};
    const result=resultSchema.parse(wasm.compile(program));
    const want=practice.diagnostic;
    if(want.stage==='compile') {
      assert.equal(result.executable,false);assert.equal(result.motions.length,0);
      assert.equal(assessPractice(practice,{source:practice.source,setup:practice.setup,revision:23,cursor:0,result,profile:null,profileError:null}).kind,'observed');
    } else {
      assert.equal(result.executable,true);
      for(let cursor=0;cursor<=result.blocks.length;cursor++) {
        const profile=stockProfileV2Schema.parse(wasm.stock_profile_v2({program,completedBlocks:cursor}));
        assert.ok(Math.abs(profileVolumeMm3(profile.spans)!-62500*Math.PI)<1e-7);
        assert.equal(profile.evaluatedBlocks,Math.min(cursor,3));
        const assessment=assessPractice(practice,{source:practice.source,setup:practice.setup,revision:23,cursor,result,profile,profileError:null});
        assert.equal(assessment.kind,cursor===want.failedAtBlock?'observed':'progress');
      }
    }
  }
  const fixed=practices.find(p=>p.id==='spindle-corrected')!;
  const program={...request(fixed.source),setup:fixed.setup};
  const result=resultSchema.parse(wasm.compile(program));
  for(let cursor=0;cursor<=result.blocks.length;cursor++) {
    const profile=stockProfileV2Schema.parse(wasm.stock_profile_v2({program,completedBlocks:cursor}));
    assert.equal(profile.complete,true);
    assert.equal(assessPractice(fixed,{source:fixed.source,setup:fixed.setup,revision:1,cursor,result,profile,profileError:null}).kind,cursor===8?'complete':'progress');
    if(cursor===8) assert.ok(Math.abs(profileVolumeMm3(profile.spans)!-58000*Math.PI)<1e-7);
  }
});

test('additive WASM v2 and annular v3 execute boring with exact material provenance',async()=>{
  const {stockProfileV3Schema}=await import('../src/lib/lathe/annularProfile.ts');
  const source=readFileSync(new URL('../fixtures/lathe/boring.nc',import.meta.url),'utf8');
  const program:CompileRequest={...request(source),apiVersion:2,dialect:'edu-lathe-v2'};
  const result=resultSchema.parse(wasm.compile_v2(program));
  assert.equal(result.executable,true);assert.equal(result.apiVersion,2);assert.equal(result.blocks.length,15);
  assert.equal(result.motions[1].toolId,'boring-id');
  for(let cursor=0;cursor<=15;cursor++){
    const profile=stockProfileV3Schema.parse(wasm.stock_profile_v3({program,completedBlocks:cursor,innerDiameterMm:20}));
    assert.equal(profile.complete,true);assert.equal(profile.evaluatedBlocks,cursor);assert.equal(profile.sourceRevision,1);
    const expected=cursor<5?52500:cursor<11?47500:43000;
    assert.ok(Math.abs(profile.volumeMm3-expected*Math.PI)<1e-8);
  }
  assert.equal(resultSchema.parse(wasm.compile({...program,apiVersion:1,dialect:'edu-lathe-v1'})).executable,false);
  assert.throws(()=>wasm.stock_profile_v3({program,completedBlocks:0,innerDiameterMm:20,extra:true}));
  assert.throws(()=>wasm.stock_profile_v3({program:{...program,setup:{...program.setup,stock:{...program.setup.stock,innerDiameterMm:20}}},completedBlocks:0,innerDiameterMm:20}));
});

test('annular WASM distinguishes a rapid through the hole from a rapid through the wall',async()=>{
  const {stockProfileV3Schema}=await import('../src/lib/lathe/annularProfile.ts');
  const program:CompileRequest={...request('G00 X10 Z2\nG00 Z-40\nG00 X60'),apiVersion:2,dialect:'edu-lathe-v2'};
  const profile=stockProfileV3Schema.parse(wasm.stock_profile_v3({program,completedBlocks:3,innerDiameterMm:20}));
  assert.equal(profile.complete,false);assert.equal(profile.evaluatedBlocks,2);
  assert.equal(profile.diagnostics[0].code,'RAPID_IN_STOCK');assert.equal(profile.diagnostics[0].span.line,3);
  assert.ok(Math.abs(profile.volumeMm3-52500*Math.PI)<1e-8);
});

test('guided annular practice confirms real WASM only after every block and checks the bore',async()=>{
  const {exerciseSchema,assessExercise}=await import('../src/lib/lathe/exercises.ts');
  const {stockProfileV3Schema}=await import('../src/lib/lathe/annularProfile.ts');
  const dir=new URL('../fixtures/lathe/',import.meta.url);
  for (const definition of JSON.parse(readFileSync(new URL('annular-exercises.json',dir),'utf8'))) {
  const exercise=exerciseSchema.parse({...definition,source:readFileSync(new URL(definition.file,dir),'utf8')});
  const {diameterMm,lengthMm}=exercise.setup.stock;
  const program:CompileRequest={apiVersion:2,dialect:'edu-lathe-v2',sourceRevision:31,source:exercise.source,
    setup:{...exercise.setup,stock:{diameterMm,lengthMm}}};
  const result=resultSchema.parse(wasm.compile_v2(program));
  assert.equal(result.executable,true);assert.equal(result.blocks.length,exercise.blockCount);
  const input={source:exercise.source,setup:exercise.setup,revision:31,result,profileError:null};
  for(let cursor=0;cursor<=result.blocks.length;cursor++){
    const profile=stockProfileV3Schema.parse(wasm.stock_profile_v3({program,completedBlocks:cursor,innerDiameterMm:exercise.setup.stock.innerDiameterMm}));
    const assessment=assessExercise(exercise,{...input,cursor,profile});
    assert.equal(assessment.kind,cursor===exercise.blockCount?'complete':'progress');
    if(cursor===exercise.blockCount){
      const unchangedHole={...profile,spans:profile.spans.map(s=>({...s,innerStartMm:10,innerEndMm:10}))};
      assert.equal(assessExercise(exercise,{...input,cursor,profile:unchangedHole}).kind,'mismatch');
      assert.equal(assessExercise(exercise,{...input,cursor:cursor-1,profile}).kind,'progress');
      assert.equal(assessExercise(exercise,{...input,cursor,profile:{...profile,sourceRevision:30}}).kind,'waiting');
    }
  }
}
});

test('annular diagnostic and its corrected air path observe real WASM material and provenance',async()=>{
  const {practicesSchema,isDiagnostic,assessPractice}=await import('../src/lib/lathe/diagnosticExercises.ts');
  const {stockProfileV3Schema}=await import('../src/lib/lathe/annularProfile.ts');
  const dir=new URL('../fixtures/lathe/',import.meta.url);
  const read=(file:string)=>JSON.parse(readFileSync(new URL(file,dir),'utf8')) as Record<string,unknown>[];
  const practices=practicesSchema.parse([...read('annular-corrections.json'),...read('annular-diagnostics.json')]
    .map(p=>({...p,source:readFileSync(new URL(String(p.file),dir),'utf8')})));
  for(const practice of practices){
    const {diameterMm,lengthMm}=practice.setup.stock;
    const program:CompileRequest={apiVersion:2,dialect:'edu-lathe-v2',sourceRevision:39,source:practice.source,
      setup:{...practice.setup,stock:{diameterMm,lengthMm}}};
    const result=resultSchema.parse(wasm.compile_v2(program));
    assert.equal(result.executable,true);assert.equal(result.diagnostics.length,0);
    for(let cursor=0;cursor<=result.blocks.length;cursor++){
      const profile=stockProfileV3Schema.parse(wasm.stock_profile_v3({program,completedBlocks:cursor,innerDiameterMm:20}));
      assert.ok(Math.abs(profile.volumeMm3-52500*Math.PI)<1e-6);
      const observed=assessPractice(practice,{source:practice.source,setup:practice.setup,revision:39,result,cursor,profile,profileError:null});
      if(isDiagnostic(practice)){
        const want=practice.diagnostic;
        if(want.stage!=='annular-profile')throw new Error('Wrong diagnostic fixture stage.');
        assert.equal(profile.evaluatedBlocks,Math.min(cursor,4));
        assert.equal(observed.kind,cursor===5?'observed':'progress');
        if(cursor===5){assert.equal(profile.diagnostics[0].code,'RAPID_IN_STOCK');assert.deepEqual(observed.targetSpan,want.span);}
      } else {
        assert.equal(profile.complete,true);assert.equal(profile.diagnostics.length,0);
        assert.equal(observed.kind,cursor===7?'complete':'progress');
      }
    }
  }
});

test('real WASM faces a tube, bores through the empty front, and preserves every prefix', async () => {
  const { stockProfileV3Schema } = await import('../src/lib/lathe/annularProfile.ts');
  const source = readFileSync(new URL('../fixtures/lathe/tubular-facing.nc', import.meta.url), 'utf8');
  const program: CompileRequest = { ...request(source), apiVersion: 2, dialect: 'edu-lathe-v2' };
  const result = resultSchema.parse(wasm.compile_v2(program));
  assert.equal(result.executable, true);
  assert.equal(result.blocks.length, 14);
  for (let cursor = 0; cursor <= 14; cursor++) {
    const profile = stockProfileV3Schema.parse(wasm.stock_profile_v3({ program, completedBlocks: cursor, innerDiameterMm: 20 }));
    assert.equal(profile.complete, true, JSON.stringify(profile.diagnostics));
    assert.equal(profile.evaluatedBlocks, cursor);
    const factor = cursor < 5 ? 52500 : cursor < 9 ? 49875 : 45500;
    assert.ok(Math.abs(profile.volumeMm3 - factor * Math.PI) < 1e-7);
    if (cursor >= 5) {
      const front = profile.spans.at(-1)!;
      assert.equal(front.zStartMm, -5);
      assert.equal(front.zEndMm, 0);
      assert.equal(front.innerStartMm, front.outerStartMm);
      assert.equal(front.innerEndMm, front.outerEndMm);
    }
  }
});

test('lab_profile lets Rust choose the material model and matches the versioned exports',()=>{
  const v2request=(text:string)=>({apiVersion:2 as const,dialect:'edu-lathe-v2' as const,sourceRevision:4,source:text,setup:defaultSetup});
  const turning='S900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30';
  for (let cursor=0;cursor<=5;cursor++) {
    const lab=wasm.lab_profile({program:v2request(turning),completedBlocks:cursor,innerDiameterMm:0});
    assert.equal(lab.profileVersion,2);
    assert.deepEqual(lab,wasm.stock_profile_v2({program:{...v2request(turning),apiVersion:1,dialect:'edu-lathe-v1'},completedBlocks:cursor}));
  }
  const boring='T5\nS900 M03\nG00 X30 Z2\nG01 Z-40 F100\nG00 X18\nG00 Z5\nM30';
  for (const [text,inner] of [[turning,20],[boring,20],[boring,0]] as const) {
    const lab=wasm.lab_profile({program:v2request(text),completedBlocks:4,innerDiameterMm:inner});
    assert.equal(lab.profileVersion,3,text);
    assert.deepEqual(lab,wasm.stock_profile_v3({program:v2request(text),completedBlocks:4,innerDiameterMm:inner}));
  }
  assert.throws(()=>wasm.lab_profile({program:v2request(turning),completedBlocks:0,innerDiameterMm:0,extra:true}));
});

test('offset table crosses the JS boundary: v2 applies it, v1 and malformed rows are rejected',()=>{
  const turning='T0101\nS900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30';
  const row={toolId:'roughing-od',calibrationErrorXMm:0,calibrationErrorZMm:0,wearXMm:-0.2,wearZMm:0};
  const v2=(extra:object)=>({apiVersion:2 as const,dialect:'edu-lathe-v2' as const,sourceRevision:5,source:turning,setup:{...defaultSetup,...extra}});
  const result=resultSchema.parse(wasm.compile_v2(v2({toolOffsets:[row]})));
  assert.ok(result.executable);
  assert.deepEqual(result.motions[0].to,{rMm:22.9,zMm:2});
  assert.deepEqual(result.blocks[2].afterState.position,{rMm:23,zMm:2},'DRO stays programmed');
  assert.deepEqual(result.blocks[2].afterState.tipPosition,{rMm:22.9,zMm:2});
  const legacy=resultSchema.parse(wasm.compile({...v2({toolOffsets:[row]}),apiVersion:1,dialect:'edu-lathe-v1'}));
  assert.equal(legacy.executable,false);
  assert.equal(legacy.diagnostics[0].code,'INVALID_REQUEST');
  assert.throws(()=>wasm.compile_v2(v2({toolOffsets:[{...row,extra:1}]})));
  const lab=wasm.lab_profile({program:v2({toolOffsets:[row]}),completedBlocks:4,innerDiameterMm:0});
  assert.equal(lab.profileVersion,2);
  assert.deepEqual(lab.spans.at(-1),{zStartMm:-30,zEndMm:0,rStartMm:22.9,rEndMm:22.9});
});

test('cycle practice: G71/G70 expand in real WASM and the guided reference confirms only at the end',async()=>{
  const {exercisesSchema,assessExercise,expectedProfileMatches}=await import('../src/lib/lathe/exercises.ts');
  const dir=new URL('../fixtures/lathe/',import.meta.url);
  const [practice]=exercisesSchema.parse(JSON.parse(readFileSync(new URL('cycle-exercises.json',dir),'utf8'))
    .map((e:Record<string,unknown>)=>({...e,source:readFileSync(new URL(String(e.file),dir),'utf8')})));
  const program={apiVersion:2 as const,dialect:'edu-lathe-v2' as const,sourceRevision:31,source:practice.source,setup:practice.setup};
  const result=resultSchema.parse(wasm.compile_v2(program));
  assert.equal(result.executable,true);
  assert.equal(result.blocks.length,practice.blockCount);
  assert.deepEqual(result.blocks.map(b=>b.cycle??null).filter(Boolean),['roughing-setup','roughing','finishing']);
  for(let cursor=0;cursor<=result.blocks.length;cursor++){
    const profile=stockProfileV2Schema.parse(wasm.lab_profile({program,completedBlocks:cursor,innerDiameterMm:0}));
    assert.equal(profile.complete,true,`@${cursor}`);
    const assessment=assessExercise(practice,{source:practice.source,setup:practice.setup,revision:31,cursor,result,profile,profileError:null});
    assert.equal(assessment.kind,cursor===result.blocks.length?'complete':'progress',`@${cursor}`);
    if(cursor===result.blocks.length) assert.equal(expectedProfileMatches(profile.spans,practice),true);
  }
  // The historical v1 compiler still refuses cycles explicitly.
  const legacy=resultSchema.parse(wasm.compile({...program,apiVersion:1,dialect:'edu-lathe-v1'}));
  assert.equal(legacy.executable,false);
});

test('nose radius and G42 cross the JS boundary: form error without compensation, exact chamfer with it',()=>{
  const setup={...defaultSetup,toolOffsets:[{toolId:'roughing-od' as const,calibrationErrorXMm:0,calibrationErrorZMm:0,wearXMm:0,wearZMm:0,noseRadiusMm:0.8}]};
  const program=(source:string)=>({apiVersion:2 as const,dialect:'edu-lathe-v2' as const,sourceRevision:3,source,setup});
  const radiusAt=(spans:{zStartMm:number;zEndMm:number;rStartMm:number;rEndMm:number}[],z:number)=>{
    const s=spans.find(s=>s.zStartMm<=z&&z<=s.zEndMm)!;
    return s.rStartMm+(z-s.zStartMm)/(s.zEndMm-s.zStartMm)*(s.rEndMm-s.rStartMm);
  };
  const plain='T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG01 X50 Z-5\nG00 X60\nG00 Z5\nM30';
  const comp='T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nG40 G00 X60\nG00 Z5\nM30';
  const a=stockProfileV2Schema.parse(wasm.lab_profile({program:program(plain),completedBlocks:8,innerDiameterMm:0}));
  const b=stockProfileV2Schema.parse(wasm.lab_profile({program:program(comp),completedBlocks:8,innerDiameterMm:0}));
  assert.ok(Math.abs(radiusAt(a.spans,-2.5)-(22.5+0.8*(2-Math.SQRT2)))<1e-9);
  assert.ok(Math.abs(radiusAt(b.spans,-2.5)-22.5)<1e-12);
  const result=resultSchema.parse(wasm.compile_v2(program(comp)));
  assert.equal(result.blocks[3].afterState.compensation,'g42');
  assert.ok(result.motions.some(m=>m.lead===true));
});

test('G96/G99 and the time estimate cross the JS boundary; v1 results carry no timing',()=>{
  const v2=(source:string)=>({apiVersion:2 as const,dialect:'edu-lathe-v2' as const,sourceRevision:6,source,setup:defaultSetup});
  const result=resultSchema.parse(wasm.compile_v2(v2('G50 S3000\nG96 S150 M03\nG99\nG00 X50 Z0\nG01 X10 F0.1\nG97 S800\nG00 X60 Z5\nM30')));
  assert.equal(result.executable,true);
  const facing=result.motions.find(m=>m.kind==='linear')!;
  assert.equal(facing.feedMmMin,null);
  assert.equal(facing.feedMmRev,0.1);
  assert.ok((facing.timeS??0)>0);
  assert.ok(Math.abs(result.estimatedTimeS!-result.motions.reduce((s,m)=>s+(m.timeS??0),0))<1e-9);
  assert.equal(result.blocks[3].afterState.cssMMin,150);
  assert.equal(result.blocks[4].afterState.spindleRpm,3000);
  const legacy=resultSchema.parse(wasm.compile(request('G00 X60 Z5\nM30')));
  assert.equal(legacy.estimatedTimeS,undefined);
});

test('TOOL_WORKING_ANGLE crosses the JS boundary as a warning; the program stays executable',()=>{
  // Arc practice before the shop review: rounding toward the chuck with T0202.
  const oldArc='G21 G18 G98\nT0202\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nG00 X60\nZ5\nM05\nM30\n';
  const v2={...request(oldArc),apiVersion:2 as const,dialect:'edu-lathe-v2' as const};
  for(const result of [wasm.compile(request(oldArc)),wasm.compile_v2(v2)].map(r=>resultSchema.parse(r))){
    assert.equal(result.executable,true);
    assert.equal(result.motions.length,4);
    // The same block also drives the finishing holder into the rounding (TOOL_HOLDER_COLLISION).
    assert.deepEqual(result.diagnostics.map(d=>d.code),['TOOL_WORKING_ANGLE','TOOL_HOLDER_COLLISION']);
    const [warning]=result.diagnostics;
    assert.equal(warning.code,'TOOL_WORKING_ANGLE');
    assert.equal(warning.severity,'warning');
    assert.equal(warning.span.line,5);
    assert.match(warning.message,/flanco trasero/);
  }
  // The rewritten practices stay clean.
  for(const file of ['arc-convex.nc','taper-turning.nc']){
    const text=readFileSync(new URL(`../fixtures/lathe/${file}`,import.meta.url),'utf8');
    const result=resultSchema.parse(wasm.compile(request(text)));
    assert.equal(result.executable,true,file);
    assert.deepEqual(result.diagnostics,[],file);
  }
});

test('Rust collision silhouettes match the drawn TS assemblies point by point',()=>{
  const model=wasm.collision_model() as { tools:{ toolId:keyof typeof TOOL_ASSEMBLIES; parts:{ role:string; outline:[number,number][] }[]; cuttingZone:[number,number][] }[];
    defaultJaws:{ gripLengthMm:number; jawHeightMm:number }; stepMm:number; toleranceMm:number };
  assert.deepEqual(model.tools.map(t=>t.toolId).sort(),Object.keys(TOOL_ASSEMBLIES).sort());
  for(const tool of model.tools){
    const parts=TOOL_ASSEMBLIES[tool.toolId].parts;
    assert.equal(tool.parts.length,parts.length,tool.toolId);
    for(const [i,part] of parts.entries()){
      assert.equal(tool.parts[i].role,part.role,tool.toolId);
      const outline=partOutline(part);
      assert.equal(tool.parts[i].outline.length,outline.length,tool.toolId);
      for(const [j,[z,r]] of outline.entries()){
        assert.ok(Math.abs(tool.parts[i].outline[j][0]-z)<1e-9&&Math.abs(tool.parts[i].outline[j][1]-r)<1e-9,`${tool.toolId} part ${i} point ${j}`);
      }
    }
  }
  assert.deepEqual(model.defaultJaws,{gripLengthMm:DEFAULT_JAW_GRIP_MM,jawHeightMm:DEFAULT_JAW_HEIGHT_MM});
  assert.equal(model.stepMm,0.25);
});

test('collision warnings cross the JS boundary with their point and honour the setup jaws',()=>{
  const intoJaws='G21 G18 G98\nT0101\nS800 M03\nG00 X44 Z2\nG01 Z-90 F150\nG00 X60\nZ5\nM05\nM30\n';
  const result=resultSchema.parse(wasm.compile_v2({...request(intoJaws),apiVersion:2,dialect:'edu-lathe-v2'}));
  assert.equal(result.executable,true);
  const [hit]=result.diagnostics;
  assert.equal(hit.code,'JAW_COLLISION');
  assert.equal(hit.severity,'warning');
  assert.equal(hit.span.line,5);
  assert.ok(hit.point&&hit.point.zMm<-85);
  // Same defaults on both sides; an explicit shallow grip clears it.
  assert.deepEqual(resolvedJaws(defaultSetup),{gripLengthMm:15,jawHeightMm:12});
  const shallow=setupSchema.parse({...defaultSetup,jaws:{gripLengthMm:5,jawHeightMm:10}});
  const clear=resultSchema.parse(wasm.compile({...request(intoJaws),setup:shallow}));
  assert.deepEqual(clear.diagnostics,[]);
  assert.throws(()=>wasm.compile({...request(intoJaws),setup:{...defaultSetup,jaws:{gripLengthMm:5,jawHeightMm:10,extra:1}}}));
  assert.equal(setupSchema.safeParse({...defaultSetup,jaws:{gripLengthMm:100,jawHeightMm:10}}).success,false);
});
