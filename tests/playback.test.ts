import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultSchema, defaultSetup } from '../src/lib/lathe/contract.ts';
import { currentState, initialPlayback, playbackReducer, type Playback } from '../src/lib/lathe/playback.ts';
const fixture=resultSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/lathe/first-program.result.json',import.meta.url),'utf8')));
const result={...fixture,sourceRevision:0};
const ready=()=>playbackReducer(initialPlayback,{type:'result',result});

test('contract decodes native Rust JSON, setup matches and source fixture is traceable',()=>{
  assert.equal(fixture.apiVersion,1);
  assert.equal(fixture.blocks.length,9);
  assert.equal(fixture.motions.length,5);
  assert.deepEqual(fixture.initialState.position,defaultSetup.initialPosition);
  assert.deepEqual(defaultSetup,JSON.parse(readFileSync(new URL('../fixtures/lathe/setup.json',import.meta.url),'utf8')));
  const lines=readFileSync(new URL('../fixtures/lathe/first-program.nc',import.meta.url),'utf8').trim().split('\n');
  assert.deepEqual(fixture.blocks.map(b=>b.source),lines);
});
test('step reaches last block, back restores spindle and reset restores all telemetry',()=>{
  let state=ready();
  assert.equal(currentState(state)?.position.rMm,30);
  for(let i=0;i<9;i++)state=playbackReducer(state,{type:'step',delta:1});
  assert.equal(state.cursor,9);
  assert.equal(currentState(state)?.ended,true);
  assert.deepEqual(playbackReducer(state,{type:'step',delta:1}),state);
  state=playbackReducer(state,{type:'step',delta:-1});
  assert.equal(currentState(state)?.spindleOn,false);
  state=playbackReducer(state,{type:'step',delta:-1});
  assert.equal(currentState(state)?.spindleOn,true);
  state=playbackReducer(state,{type:'reset'});
  assert.deepEqual(currentState(state),result.initialState);
  assert.deepEqual(playbackReducer(state,{type:'step',delta:-1}),state);
});
test('steps include state-only lines and no movement is skipped',()=>{
  let state=ready();
  state=playbackReducer(state,{type:'step',delta:1});
  assert.equal(currentState(state)?.spindleOn,false);
  state=playbackReducer(state,{type:'step',delta:1});
  assert.equal(currentState(state)?.spindleOn,true);
  state=playbackReducer(state,{type:'step',delta:1});
  assert.deepEqual(currentState(state)?.position,{rMm:27,zMm:2});
});
test('edit invalidates and discards stale results and errors',()=>{
  const edited=playbackReducer(ready(),{type:'edit'});
  assert.equal(edited.result,null);
  assert.equal(edited.revision,1);
  assert.equal(currentState(edited),null);
  assert.deepEqual(playbackReducer(edited,{type:'result',result}),edited);
  assert.deepEqual(playbackReducer(edited,{type:'error',revision:0,message:'stale'}),edited);
  assert.deepEqual(playbackReducer(edited,{type:'compile',revision:0}),edited);
});
test('errors, loading, invalid and empty programs cannot step',()=>{
  const invalid={...result,executable:false,blocks:[],motions:[],finalState:null};
  for(const state of [initialPlayback,playbackReducer(ready(),{type:'compile',revision:0}),
    playbackReducer(ready(),{type:'result',result:invalid}),
    playbackReducer(ready(),{type:'error',revision:0,message:'network'}),
    playbackReducer(ready(),{type:'result',result:{...result,blocks:[],motions:[]}})] satisfies Playback[]) {
    assert.equal(playbackReducer(state,{type:'step',delta:1}).cursor,0);
  }
});
test('contract rejects version drift, nonfinite values and unknown fields',()=>{
  assert.throws(()=>resultSchema.parse({...result,apiVersion:2}));
  assert.throws(()=>resultSchema.parse({...result,unexpected:true}));
  assert.throws(()=>resultSchema.parse({...result,initialState:{...result.initialState,position:{rMm:NaN,zMm:0}}}));
});

test('play activates running with incremented runId only when ready, executable and cursor < blocks.length', () => {
  let state = ready();
  assert.equal(state.running, false);
  assert.equal(state.runId, 0);

  // Play exitoso
  state = playbackReducer(state, { type: 'play' });
  assert.equal(state.running, true);
  assert.equal(state.runId, 1);

  // No permite reproducir al final del programa
  for (let i = 0; i < 9; i++) state = playbackReducer(state, { type: 'step', delta: 1 });
  assert.equal(state.cursor, 9);
  assert.equal(state.running, false);

  const atEnd = playbackReducer(state, { type: 'play' });
  assert.equal(atEnd.running, false);
  assert.equal(atEnd.runId, 1); // runId no debe cambiar si no inició
});

test('tick advances one block and stops automatically at the last block', () => {
  let state = playbackReducer(ready(), { type: 'play' });
  const runId = state.runId;

  // Ejecutar 8 ticks válidos
  for (let i = 0; i < 8; i++) {
    state = playbackReducer(state, { type: 'tick', revision: state.revision, cursor: i, runId });
    assert.equal(state.cursor, i + 1);
    assert.equal(state.running, true);
  }

  // Noveno tick: llega a 9 (total de bloques) y pausa automáticamente
  state = playbackReducer(state, { type: 'tick', revision: state.revision, cursor: 8, runId });
  assert.equal(state.cursor, 9);
  assert.equal(state.running, false);
});

test('tick rejects mismatched runId, revision, cursor or when not running', () => {
  const state = playbackReducer(ready(), { type: 'play' });
  const { revision, cursor, runId } = state;

  // Stale runId (sesión anterior)
  assert.deepEqual(playbackReducer(state, { type: 'tick', revision, cursor, runId: runId - 1 }), state);
  // Stale revision
  assert.deepEqual(playbackReducer(state, { type: 'tick', revision: revision + 1, cursor, runId }), state);
  // Desynchronized cursor
  assert.deepEqual(playbackReducer(state, { type: 'tick', revision, cursor: cursor + 1, runId }), state);

  // Pausado: no procesa ticks
  const paused = playbackReducer(state, { type: 'pause' });
  assert.deepEqual(playbackReducer(paused, { type: 'tick', revision, cursor, runId }), paused);
});

test('manual actions, compile, accepted result and errors pause execution', () => {
  const active = () => playbackReducer(ready(), { type: 'play' });

  assert.equal(playbackReducer(active(), { type: 'step', delta: 1 }).running, false);
  assert.equal(playbackReducer(active(), { type: 'reset' }).running, false);
  assert.equal(playbackReducer(active(), { type: 'edit' }).running, false);
  assert.equal(playbackReducer(active(), { type: 'compile', revision: 0 }).running, false);
  assert.equal(playbackReducer(active(), { type: 'result', result }).running, false);
  assert.equal(playbackReducer(active(), { type: 'error', revision: 0, message: 'err' }).running, false);
});

test('stale compile, error or result do not pause or modify ongoing playback', () => {
  const state = playbackReducer(ready(), { type: 'play' });
  assert.equal(state.running, true);

  // Acciones con revisión desactualizada
  assert.deepEqual(playbackReducer(state, { type: 'compile', revision: 99 }), state);
  assert.deepEqual(playbackReducer(state, { type: 'error', revision: 99, message: 'stale' }), state);
  assert.deepEqual(playbackReducer(state, { type: 'result', result: { ...result, sourceRevision: 99 } }), state);
});

test('a new play session rejects a delayed tick even at the same revision and cursor', () => {
  const first = playbackReducer(ready(), { type: 'play' });
  assert.equal(playbackReducer(first, { type: 'play' }), first);
  const resumed = playbackReducer(playbackReducer(first, { type: 'pause' }), { type: 'play' });
  assert.equal(resumed.runId, first.runId + 1);
  assert.equal(playbackReducer(resumed, { type: 'tick', revision: first.revision,
    cursor: first.cursor, runId: first.runId }), resumed);
  for (const invalid of [initialPlayback, { ...ready(), status: 'loading' as const },
    { ...ready(), result: { ...result, executable: false } }, { ...ready(), cursor: 9 }]) {
    assert.equal(playbackReducer(invalid, { type: 'play' }), invalid);
    const forged = { ...invalid, running: true };
    const tick = { type: 'tick' as const, revision: forged.revision, cursor: forged.cursor, runId: forged.runId };
    assert.equal(playbackReducer(forged, tick).cursor, invalid.cursor);
  }
});
