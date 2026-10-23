import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockProfileSchema, stockProfileV2Schema } from '../src/lib/lathe/profile.ts';
const sample = () => ({ profileVersion:2, sourceRevision:3, completedBlocks:4, evaluatedBlocks:4, complete:true, diagnostics:[],
  spans:[{zStartMm:-100,zEndMm:-60,rStartMm:25,rEndMm:25},{zStartMm:-60,zEndMm:0,rStartMm:10,rEndMm:20}] });

test('v2 permits analytical tapers and shoulders but does not weaken the v1 contract', () => {
  assert.deepEqual(stockProfileV2Schema.parse(sample()),sample());
  assert.equal(stockProfileSchema.safeParse(sample()).success,false);
  assert.equal(stockProfileV2Schema.safeParse({...sample(),profileVersion:1}).success,false);
  const legacy={...sample(),profileVersion:1,spans:[{zStartMm:-100,zEndMm:0,radiusMm:25}]};
  assert.equal(stockProfileSchema.safeParse(legacy).success,true);
  assert.equal(stockProfileV2Schema.safeParse(legacy).success,false);
});
test('v2 enforces finite nonnegative radii, bounded ordered contiguous spans and strict fields', () => {
  for (const changes of [{rStartMm:-1},{rEndMm:NaN},{rStartMm:Infinity},{zStartMm:-1e10},
    {zEndMm:-100},{zEndMm:-101},{radiusMm:25}]) {
    const value=sample(); Object.assign(value.spans[0],changes);
    assert.equal(stockProfileV2Schema.safeParse(value).success,false);
  }
  const gap=sample();gap.spans[1].zStartMm=-59;
  assert.equal(stockProfileV2Schema.safeParse(gap).success,false);
  const overlap=sample();overlap.spans[1].zStartMm=-61;
  assert.equal(stockProfileV2Schema.safeParse(overlap).success,false);
  assert.equal(stockProfileV2Schema.safeParse({...sample(),cachedMesh:{}}).success,false);
});
test('v2 applies the same trustworthy-prefix cursor invariant and resource boundary', () => {
  assert.equal(stockProfileV2Schema.safeParse({...sample(),evaluatedBlocks:5}).success,false);
  assert.equal(stockProfileV2Schema.safeParse({...sample(),evaluatedBlocks:3}).success,false);
  assert.equal(stockProfileV2Schema.safeParse({...sample(),complete:false,evaluatedBlocks:3}).success,true);
  const spans=Array.from({length:4096},(_,i)=>({zStartMm:i-4096,zEndMm:i-4095,rStartMm:1,rEndMm:1}));
  assert.equal(stockProfileV2Schema.safeParse({...sample(),spans}).success,true);
  spans.unshift({zStartMm:-4097,zEndMm:-4096,rStartMm:1,rEndMm:1});
  assert.equal(stockProfileV2Schema.safeParse({...sample(),spans}).success,false);
});
