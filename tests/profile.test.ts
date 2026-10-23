import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockProfileSchema, profileMatches, type ProfileResponse } from '../src/lib/lathe/profile.ts';
const initial={profileVersion:1,sourceRevision:3,completedBlocks:0,evaluatedBlocks:0,complete:true,
  spans:[{zStartMm:-100,zEndMm:0,radiusMm:25}],diagnostics:[]};
test('profile contract rejects nonfinite, reversed or discontinuous spans and inconsistent cursors',()=>{
  assert.equal(stockProfileSchema.parse(initial).complete,true);
  for(const spans of [[{zStartMm:0,zEndMm:-100,radiusMm:25}], [{zStartMm:-100,zEndMm:0,radiusMm:NaN}],
    [{zStartMm:-100,zEndMm:-50,radiusMm:25},{zStartMm:-40,zEndMm:0,radiusMm:20}]]) {
    assert.throws(()=>stockProfileSchema.parse({...initial,spans}));
  }
  assert.throws(()=>stockProfileSchema.parse({...initial,evaluatedBlocks:1}));
  assert.throws(()=>stockProfileSchema.parse({...initial,completedBlocks:3,evaluatedBlocks:2}));
});
test('only a matching source revision, cursor and retry may supply current geometry',()=>{
  const response:ProfileResponse={revision:3,cursor:5,attempt:0,profile:stockProfileSchema.parse({...initial,completedBlocks:5,evaluatedBlocks:5}),error:null};
  assert.equal(profileMatches(response,3,5,0),true);
  assert.equal(profileMatches(response,4,5,0),false);
  assert.equal(profileMatches(response,3,4,0),false);
  assert.equal(profileMatches(response,3,5,1),false);
  assert.equal(profileMatches(null,3,5,0),false);
});
