import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultSchema } from '../src/lib/lathe/contract.ts';
import { stockProfileV2Schema } from '../src/lib/lathe/profile.ts';
import { assessPractice, diagnosticDefinitionSchema, practicesSchema, isDiagnostic } from '../src/lib/lathe/diagnosticExercises.ts';
import type { AssessmentInput } from '../src/lib/lathe/exercises.ts';
const dir=new URL('../fixtures/lathe/',import.meta.url);
const json=(name:string)=>JSON.parse(readFileSync(new URL(name,dir),'utf8'));
const entries=[...json('exercises.json'),...json('diagnostic-corrections.json'),...json('diagnostic-exercises.json')];
const practices=practicesSchema.parse(entries.map(e=>({...e,source:readFileSync(new URL(e.file,dir),'utf8')})));
const snapshots=json('diagnostic-reference-results.json');
function input(id:string):AssessmentInput {
  const practice=practices.find(p=>p.id===id)!;
  const sample=snapshots[practice.file.replace('.nc','')];
  return {source:practice.source,setup:practice.setup,revision:23,cursor:sample.profile?.completedBlocks??0,
    result:resultSchema.parse(sample.result),profile:sample.profile?stockProfileV2Schema.parse(sample.profile):null,profileError:null};
}
test('diagnostic catalogue keeps seven positive references and two distinct diagnostic stages',()=>{
  assert.equal(practices.filter(p=>!isDiagnostic(p)).length,7);
  assert.equal(practices.filter(isDiagnostic).length,2);
  assert.throws(()=>practicesSchema.parse([...practices,practices[0]]));
  assert.throws(()=>practicesSchema.parse(practices.filter(p=>p.id!=='spindle-corrected')));
  const diagnostic=json('diagnostic-exercises.json')[0];
  assert.doesNotThrow(()=>diagnosticDefinitionSchema.parse(diagnostic));
  assert.throws(()=>diagnosticDefinitionSchema.parse({...diagnostic,expectedSpans:[]}));
  assert.throws(()=>diagnosticDefinitionSchema.parse({...diagnostic,diagnostic:{...diagnostic.diagnostic,evaluatedBlocks:4}}));
  assert.throws(()=>diagnosticDefinitionSchema.parse({...diagnostic,diagnostic:{...diagnostic.diagnostic,span:{line:4,columnStart:5,columnEnd:2}}}));
});
test('current exact diagnostics are observed and only the corrected profile completes normally',()=>{
  for(const id of ['diagnose-spindle','diagnose-unsupported']) {
    const result=assessPractice(practices.find(p=>p.id===id)!,input(id));
    assert.equal(result.kind,'observed');assert.ok(result.targetSpan);
  }
  assert.equal(assessPractice(practices.find(p=>p.id==='spindle-corrected')!,input('spindle-corrected')).kind,'complete');
});
test('diagnostic observation is revoked by changed documents, stale results, rewind and later cursor',()=>{
  const practice=practices.find(p=>p.id==='diagnose-spindle')!,base=input(practice.id);
  for(const change of [{source:base.source+'; edit'}, {setup:{...base.setup!,toolId:'finishing-od' as const}}]) {
    assert.equal(assessPractice(practice,{...base,...change}).kind,'modified');
  }
  assert.equal(assessPractice(practice,{...base,revision:24}).kind,'pending');
  for(const cursor of [0,3,5,7])assert.equal(assessPractice(practice,{...base,cursor}).kind,'progress');
  assert.equal(assessPractice(practice,{...base,profile:{...base.profile!,sourceRevision:22}}).kind,'waiting');
  assert.equal(assessPractice(practice,{...base,profileError:'network'}).kind,'blocked');
});
test('another code, severity, span or frozen material never counts as the expected diagnostic',()=>{
  for(const id of ['diagnose-spindle','diagnose-unsupported']) {
    const practice=practices.find(p=>p.id===id)!,base=input(id);
    const diagnostics=(base.profile??base.result!).diagnostics;
    for(const changed of [{...diagnostics[0],code:'OTHER'}, {...diagnostics[0],severity:id==='diagnose-spindle'?'error' as const:'warning' as const},
      {...diagnostics[0],span:{...diagnostics[0].span,line:99}}, {...diagnostics[0],span:{...diagnostics[0].span,columnEnd:99}}]) {
      const next=base.profile?{...base,profile:{...base.profile,diagnostics:[changed]}}:{...base,result:{...base.result!,diagnostics:[changed]}};
      assert.equal(assessPractice(practice,next).kind,'mismatch');
    }
  }
  const practice=practices.find(p=>p.id==='diagnose-spindle')!,base=input(practice.id);
  assert.equal(assessPractice(practice,{...base,profile:stockProfileV2Schema.parse({...base.profile!,spans:[{zStartMm:-100,zEndMm:0,rStartMm:20,rEndMm:20}]})}).kind,'mismatch');
  assert.equal(assessPractice(practice,{...base,profile:{...base.profile!,complete:true,evaluatedBlocks:4}}).kind,'mismatch');
});
