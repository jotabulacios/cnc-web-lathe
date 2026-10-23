import assert from 'node:assert/strict';
import {test} from 'node:test';
import {profileRadiusAt,profileVolumeMm3} from '../src/lib/lathe/profileMeasures.ts';

test('resolved profile measurements use physical radii and analytic cylinder/frustum volume',()=>{
  assert.equal(profileVolumeMm3([{zStartMm:-3,zEndMm:0,radiusMm:2}]),12*Math.PI);
  const cone=[{zStartMm:-6,zEndMm:0,rStartMm:1,rEndMm:3}];
  assert.ok(Math.abs(profileVolumeMm3(cone)!-26*Math.PI)<1e-12);
  assert.equal(profileRadiusAt(cone,-3),2);
  assert.equal(profileRadiusAt(cone,-6),1);
  assert.equal(profileRadiusAt(cone,0),3);
});
test('shoulders use the smaller neighbor, empty material measures zero and out of domain is absent',()=>{
  const profile=[{zStartMm:-10,zEndMm:-5,radiusMm:4},{zStartMm:-5,zEndMm:-1,radiusMm:2},{zStartMm:-1,zEndMm:0,radiusMm:0}];
  assert.equal(profileRadiusAt(profile,-5),2);
  assert.equal(profileRadiusAt(profile,-1),0);
  assert.equal(profileRadiusAt(profile,-0.5),0);
  assert.equal(profileRadiusAt(profile,-11),null);
  assert.equal(profileRadiusAt(profile,1),null);
  assert.equal(profileVolumeMm3([{zStartMm:-10,zEndMm:0,radiusMm:0}]),0);
});
test('malformed, nonfinite, empty and disconnected resolved profiles are not measured as valid material',()=>{
  for(const profile of [[],[{zStartMm:0,zEndMm:0,radiusMm:1}],[{zStartMm:-1,zEndMm:0,radiusMm:-1}],
    [{zStartMm:-1,zEndMm:0,radiusMm:NaN}],[{zStartMm:-2,zEndMm:-1,radiusMm:1},{zStartMm:-0.5,zEndMm:0,radiusMm:1}]]) {
    assert.equal(profileVolumeMm3(profile),null);
    assert.equal(profileRadiusAt(profile,-0.5),null);
  }
  assert.equal(profileRadiusAt([{zStartMm:-1,zEndMm:0,radiusMm:1}],NaN),null);
});
