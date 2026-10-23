import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ISO_STATIONS, resolveAssemblies } from '../src/lib/lathe/isoTools.ts';
import { TOOL_ASSEMBLIES, assemblyBounds } from '../src/lib/lathe/toolAssemblies.ts';
import { defaultSetup } from '../src/lib/lathe/contract.ts';
import { copyDocument } from '../src/lib/lathe/document.ts';
import { draftFromSetup } from '../src/lib/lathe/setup.ts';
import { decodeProject, encodeProject } from '../src/lib/lathe/project.ts';
import { createLatheView } from '../src/lib/lathe/viewport.ts';

test('valid ISO choices replace only their station; blank and invalid rows keep the educational design', () => {
  const { assemblies, results } = resolveAssemblies({
    'roughing-od': { insert: 'cnmg120408', holder: 'PCLNR 2020K12' },
    'finishing-od': { insert: 'DNMG 150604', holder: 'PCLNR 2020K12' },
    'generic-od': { insert: ' ', holder: '' },
  });
  assert.equal(assemblies['roughing-od'].provenance, 'iso-nominal');
  assert.match(assemblies['roughing-od'].dimensions, /^Nominal ISO, no datos de fabricante/);
  assert.equal(results['finishing-od']?.ok, false, 'D insert in a C holder is incompatible');
  assert.equal(assemblies['finishing-od'], TOOL_ASSEMBLIES['finishing-od']);
  assert.equal(assemblies['generic-od'], TOOL_ASSEMBLIES['generic-od']);
  assert.equal(results['generic-od'], undefined);
  assert.deepEqual(ISO_STATIONS, ['generic-od', 'roughing-od', 'finishing-od']);
  // Nominal shank: 125 mm long radially, 20 mm wide axially (ISO 5608 'K', '2020').
  const bounds = assemblyBounds(assemblies['roughing-od']);
  assert.ok(bounds.maxR - bounds.minR >= 125 - 1e-9);
  // The 2D frame uses the replaced geometry for every planned motion of that tool.
  const motion = { id: 0, blockId: 0, span: { line: 1, columnStart: 1, columnEnd: 2 }, kind: 'rapid' as const,
    from: { rMm: 30, zMm: 5 }, to: { rMm: 30, zMm: 5 }, feedMmMin: null, toolId: 'roughing-od' as const, lengthMm: 0 };
  const iso = createLatheView([motion], { rMm: 30, zMm: 5 }, defaultSetup.stock, assemblyBounds(assemblies['generic-od']), assemblies);
  const edu = createLatheView([motion], { rMm: 30, zMm: 5 }, defaultSetup.stock, assemblyBounds(TOOL_ASSEMBLIES['generic-od']));
  assert.ok(iso.maxR > edu.maxR, 'longer ISO shank enlarges the frame');
});

test('ISO designations are saved with the document but never in the engine setup', () => {
  const draft = { ...draftFromSetup(defaultSetup), isoTools: { 'roughing-od': { insert: 'CNMG 120408', holder: 'PCLNR 2020K12' } } };
  const document = copyDocument({ source: 'G00 X60 Z5\nM30\n', setup: defaultSetup, draft, exerciseId: null });
  const decoded = decodeProject(encodeProject(document));
  assert.deepEqual(decoded.draft.isoTools, draft.isoTools);
  assert.equal('isoTools' in decoded.setup, false);
  assert.throws(() => decodeProject(encodeProject({ ...document, draft: { ...draft, isoTools: { 'roughing-od': { insert: 'x'.repeat(40), holder: '' } } } })));
});
