import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSetup } from '../src/lib/lathe/contract.ts';
import { copyDocument, type LabDocument } from '../src/lib/lathe/document.ts';
import { draftFromSetup } from '../src/lib/lathe/setup.ts';
import { decodeProject, encodeProject, loadProject, saveProject, MAX_PROGRAM_BYTES, MAX_PROJECT_BYTES, PROJECT_STORAGE_KEY } from '../src/lib/lathe/project.ts';

function document(): LabDocument {
  return copyDocument({ source: '; práctica 🛠\r\nG00 X70 Z8\r\nM30\r\n', setup: defaultSetup, draft: draftFromSetup(defaultSetup), exerciseId: null });
}
test('project roundtrip preserves source, invalid drafts and detached setup without execution artifacts', () => {
  const original = document();
  original.draft.length = 'pendiente';
  const encoded = encodeProject(original);
  const loaded = decodeProject(encoded);
  assert.deepEqual(loaded, original);
  assert.deepEqual(Object.keys(JSON.parse(encoded).document).sort(), ['draft', 'exerciseId', 'setup', 'source']);
  loaded.setup.stock.diameterMm = 70;
  loaded.draft.length = '200';
  assert.equal(original.setup.stock.diameterMm, 50);
  assert.equal(original.draft.length, 'pendiente');
});

test('strict version, dialect, fields, physical setup and valid draft consistency are enforced', () => {
  const payload = JSON.parse(encodeProject(document()));
  for (const changed of [{ ...payload, version: 2 }, { ...payload, format: 'other' }, { ...payload, dialect: 'fanuc' },
    { ...payload, cursor: 9 }, { ...payload, document: { ...payload.document, result: {} } },
    { ...payload, document: { ...payload.document, setup: { ...defaultSetup, xConvention: 'radius' } } }]) {
    assert.throws(() => decodeProject(JSON.stringify(changed)));
  }
  const mismatch = document();
  mismatch.setup.stock.diameterMm = 70;
  assert.throws(() => encodeProject(mismatch), /no coinciden/);
  const outOfRange = document();
  outOfRange.setup.initialPosition.rMm = 6e8;
  outOfRange.draft.initialX = '1200000000';
  assert.throws(() => encodeProject(outOfRange));
});

test('UTF-8 program and JSON limits use bytes, preserving the exact boundary', () => {
  const original = document();
  original.source = 'é'.repeat(MAX_PROGRAM_BYTES / 2);
  assert.equal(decodeProject(encodeProject(original)).source, original.source);
  original.source += 'é';
  assert.throws(() => encodeProject(original), /256 KiB/);
  assert.throws(() => decodeProject(' '.repeat(MAX_PROJECT_BYTES + 1)), /2 MiB/);
  for (const invalid of ['', '{broken', 'null', '[]']) assert.throws(() => decodeProject(invalid));
  original.source = 'M30';
  original.draft.diameter = 'x'.repeat(1025);
  assert.throws(() => encodeProject(original), /campos/);
});

test('storage uses its isolated key and failed writes retain the previous saved document', () => {
  const values = new Map<string, string>([['legacy-cnc', 'untouched']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(loadProject(storage), null);
  const original = document();
  saveProject(storage, original);
  assert.deepEqual(loadProject(storage), original);
  assert.equal(values.get('legacy-cnc'), 'untouched');
  const before = values.get(PROJECT_STORAGE_KEY);
  const broken = { ...storage, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveProject(broken, { ...original, source: 'M30' }), /Quota/);
  assert.equal(values.get(PROJECT_STORAGE_KEY), before);
  values.set(PROJECT_STORAGE_KEY, '{invalid');
  assert.throws(() => loadProject(storage), /JSON válido/);
});

test('all initial tools roundtrip, including invalid numeric drafts, while unknown or conflicting tools are rejected', () => {
  for (const toolId of ['generic-od','roughing-od','finishing-od','grooving-od','facing-od'] as const) {
    const original=document();
    original.setup.toolId=toolId;
    original.draft=draftFromSetup(original.setup);
    assert.deepEqual(decodeProject(encodeProject(original)),original);
    original.draft.length='pendiente';
    assert.deepEqual(decodeProject(encodeProject(original)),original);
    const payload=JSON.parse(encodeProject(original));
    for(const invalid of ['unknown',toolId==='generic-od'?'roughing-od':'generic-od']) {
      payload.document.draft.toolId=invalid;
      assert.throws(()=>decodeProject(JSON.stringify(payload)));
    }
  }
});

test('legacy JSON without a draft tool inherits setup on load and save, preserving pending numeric fields', () => {
  for (const toolId of ['generic-od','finishing-od'] as const) {
    const original=document();original.setup.toolId=toolId;
    original.draft=draftFromSetup(original.setup);
    original.draft.length='pendiente';
    const legacy=JSON.parse(encodeProject(original));
    delete legacy.document.draft.toolId;
    assert.deepEqual(decodeProject(JSON.stringify(legacy)),original);
    const before=copyDocument(original);delete before.draft.toolId;
    assert.equal(JSON.parse(encodeProject(before)).document.draft.toolId,toolId);
    assert.equal(before.draft.toolId,undefined);
  }
});

test('tubular projects use v2 while old solids remain v1 without injected material fields', () => {
  const legacy = document();
  const oldPayload = JSON.parse(encodeProject(legacy));
  assert.equal(oldPayload.version, 1);
  assert.equal(oldPayload.dialect, 'edu-lathe-v1');
  const oldRoundtrip = decodeProject(JSON.stringify(oldPayload));
  assert.equal('innerDiameterMm' in oldRoundtrip.setup.stock, false);
  assert.equal('innerDiameter' in oldRoundtrip.draft, false);
  const tube = document();
  tube.setup.stock.innerDiameterMm = 20;
  tube.setup.toolId = 'boring-id';
  tube.draft = draftFromSetup(tube.setup);
  const encoded = encodeProject(tube);
  const payload = JSON.parse(encoded);
  assert.equal(payload.version, 2);
  assert.equal(payload.dialect, 'edu-lathe-v2');
  assert.deepEqual(decodeProject(encoded), tube);
  assert.throws(() => decodeProject(JSON.stringify({ ...payload, version: 1, dialect: 'edu-lathe-v1' })));
  assert.throws(() => decodeProject(JSON.stringify({ ...payload, dialect: 'edu-lathe-v1' })));
});

test('v2 keeps incomplete interior drafts and the last valid stock without losing numeric text', () => {
  for (const text of ['', 'pendiente', '-1', '50']) {
    const original = document();
    original.setup.stock.innerDiameterMm = 20;
    original.draft = { ...draftFromSetup(original.setup), innerDiameter: text };
    const encoded = encodeProject(original);
    assert.equal(JSON.parse(encoded).version, 2);
    assert.deepEqual(decodeProject(encoded), original);
  }
  const mismatch = document();
  mismatch.setup.stock.innerDiameterMm = 20;
  mismatch.draft.innerDiameter = '10';
  assert.throws(() => encodeProject(mismatch), /no coinciden/);
});

test('v1 payload cannot smuggle zero inner diameter, interior draft or T5 through another invalid draft', () => {
  const payload = JSON.parse(encodeProject(document()));
  payload.document.draft.length = 'pendiente';
  for (const mutate of [
    (value: typeof payload) => { value.document.setup.stock.innerDiameterMm = 0; },
    (value: typeof payload) => { value.document.draft.innerDiameter = 'pendiente'; },
    (value: typeof payload) => { value.document.setup.toolId = 'boring-id'; value.document.draft.toolId = 'boring-id'; },
  ]) {
    const changed = structuredClone(payload); mutate(changed);
    assert.throws(() => decodeProject(JSON.stringify(changed)));
  }
  const explicitSolid = document();
  explicitSolid.draft.innerDiameter = '0';
  assert.equal(JSON.parse(encodeProject(explicitSolid)).version, 2);
});

test('an app using dialect v2 can save it explicitly even when T5 appears only in source', () => {
  const original = document();
  original.source = 'T0505\nM30';
  const encoded = encodeProject(original, 2);
  const payload = JSON.parse(encoded);
  assert.equal(payload.version, 2);
  assert.equal(payload.dialect, 'edu-lathe-v2');
  assert.deepEqual(decodeProject(encoded), original);
  const values = new Map<string, string>();
  saveProject({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, original, 2);
  assert.equal(JSON.parse(values.get(PROJECT_STORAGE_KEY)!).dialect, 'edu-lathe-v2');
  const old = document();
  const legacy = encodeProject(old, 1);
  assert.equal(JSON.parse(legacy).version, 1);
  assert.deepEqual(decodeProject(legacy), old);
});

test('explicit project version cannot downgrade tube data into a legacy contract', () => {
  const tube = document();
  tube.setup.stock.innerDiameterMm = 20;
  tube.draft = draftFromSetup(tube.setup);
  assert.throws(() => encodeProject(tube, 1));
  assert.deepEqual(decodeProject(encodeProject(tube, 2)), tube);
});

test('offset tables require and roundtrip through a v2 project, and must match their draft', () => {
  const draft = { ...draftFromSetup(defaultSetup), offsets: { 'roughing-od': { calibrationErrorX: '0', calibrationErrorZ: '0', wearX: '-0,2', wearZ: '0' } } };
  const setup = { ...defaultSetup, toolOffsets: [{ toolId: 'roughing-od' as const, calibrationErrorXMm: 0, calibrationErrorZMm: 0, wearXMm: -0.2, wearZMm: 0 }] };
  const withOffsets = copyDocument({ ...document(), setup, draft });
  const encoded = JSON.parse(encodeProject(withOffsets));
  assert.equal(encoded.version, 2);
  assert.deepEqual(decodeProject(JSON.stringify(encoded)).setup.toolOffsets, setup.toolOffsets);
  assert.throws(() => encodeProject(withOffsets, 1));
  const mismatch = structuredClone(encoded);
  mismatch.document.setup.toolOffsets[0].wearXMm = -0.3;
  assert.throws(() => decodeProject(JSON.stringify(mismatch)));
});

test('jaws persist with the project and older projects without them stay valid', () => {
  const withJaws = document();
  withJaws.setup = { ...withJaws.setup, jaws: { gripLengthMm: 25, jawHeightMm: 10 } };
  withJaws.draft = draftFromSetup(withJaws.setup);
  const loaded = decodeProject(encodeProject(withJaws));
  assert.deepEqual(loaded.setup.jaws, { gripLengthMm: 25, jawHeightMm: 10 });
  assert.equal(loaded.draft.gripLength, '25');
  assert.equal(JSON.parse(encodeProject(withJaws)).version, 1);
  const legacy = decodeProject(encodeProject(document()));
  assert.equal(legacy.setup.jaws, undefined);
  const mismatch = document();
  mismatch.draft.gripLength = '30';
  assert.throws(() => encodeProject(mismatch), /no coinciden/);
});
