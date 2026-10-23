import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profilePathV2 } from '../src/lib/lathe/profilePathV2.ts';
const s=(a:number,b:number,ra:number,rb:number)=>({zStartMm:a,zEndMm:b,rStartMm:ra,rEndMm:rb});
const id=(n:number)=>n;
test('linear profile projection preserves taper endpoints, mirror and shoulders at physical radius',()=>{
  assert.equal(profilePathV2([s(-100,-60,25,25),s(-60,0,10,20)],id,id), 'M -100 25 L -60 25 L -60 10 L 0 20 L 0 -20 L -60 -10 L -60 -25 L -100 -25 Z');
});
test('single zero-radius tips remain visible while fully removed spans split paths',()=>{
  assert.equal(profilePathV2([s(-100,-60,0,20)],id,id),'M -100 0 L -60 20 L -60 -20 L -100 0 Z');
  const path=profilePathV2([s(-100,-80,10,0),s(-80,-20,0,0),s(-20,0,0,10)],id,id);
  assert.equal((path.match(/M /g)??[]).length,2);
  assert.equal((path.match(/ Z/g)??[]).length,2);
  assert.equal(profilePathV2([s(-100,0,0,0)],id,id),'');
});
