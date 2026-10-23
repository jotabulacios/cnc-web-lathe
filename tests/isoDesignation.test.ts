import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkCompatibility, edgeLengthMm, isoAssembly, parseHolderDesignation, parseInsertDesignation,
  type HolderDesignation, type InsertDesignation,
} from '../src/lib/lathe/isoDesignation.ts';
import { assemblyBounds, partOutline, type ToolAssembly, type ToolPoint } from '../src/lib/lathe/toolAssemblies.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const deg = (rad: number) => rad * 180 / Math.PI;
const insertOf = (code: string): InsertDesignation => { const r = parseInsertDesignation(code); assert.ok(r.ok, code); return r.value; };
const holderOf = (code: string): HolderDesignation => { const r = parseHolderDesignation(code); assert.ok(r.ok, code); return r.value; };
const angleBetween = (a: ToolPoint, b: ToolPoint) => deg(Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))));

test('ISO 1832 inserts decode to nominal values (hand-computed oracles)', () => {
  const c = insertOf('CNMG 120408');
  assert.equal(c.pointAngleDeg, 80); assert.equal(c.polygon, 'rhombic'); assert.equal(c.clearanceDeg, 0);
  assert.equal(c.toleranceClass, 'M'); assert.equal(c.typeLetter, 'G');
  assert.equal(c.icMm, 12.7); assert.equal(c.thicknessMm, 4.76); assert.equal(c.noseRadiusMm, 0.8);
  // Rhombus side = IC / sin(80°) = 12.7 / 0.98481 = 12.896 → truncated code 12.
  close(c.edgeLengthMm, 12.896, 1e-3); assert.equal(c.provenance, 'iso-nominal');

  const d = insertOf('dnmg150604');
  assert.equal(d.pointAngleDeg, 55); assert.equal(d.icMm, 12.7); assert.equal(d.thicknessMm, 6.35); assert.equal(d.noseRadiusMm, 0.4);
  close(d.edgeLengthMm, 12.7 / Math.sin(55 * Math.PI / 180)); // 15.504

  const v = insertOf('VBMT 160404');
  assert.equal(v.pointAngleDeg, 35); assert.equal(v.clearanceDeg, 5); assert.equal(v.icMm, 9.525); assert.equal(v.thicknessMm, 4.76);
  close(v.edgeLengthMm, 16.606, 1e-3);

  const t = insertOf('TNMG 160408');
  assert.equal(t.polygon, 'triangle'); assert.equal(t.icMm, 9.525);
  close(t.edgeLengthMm, 9.525 * Math.sqrt(3)); // equilateral triangle side = IC·√3 = 16.497
  assert.equal(insertOf('TCMT 110204').icMm, 6.35); // 10.998 rounds to 11.0 before truncation
  assert.equal(insertOf('TNMG 220408').icMm, 12.7);

  const w = insertOf('WNMG 080408');
  assert.equal(w.polygon, 'trigon'); assert.equal(w.pointAngleDeg, 80); assert.equal(w.icMm, 12.7);
  // Trigon side from tangent lengths: 6.35·(cot 40° + cot 80°) = 8.687.
  close(w.edgeLengthMm, 8.687, 1e-3);

  const s = insertOf('SNMG 120408'); assert.equal(s.icMm, 12.7); close(s.edgeLengthMm, 12.7);
  assert.equal(insertOf('CCMT 09T304').thicknessMm, 3.97);
  assert.equal(insertOf('CCMT 060204').icMm, 6.35);
  assert.equal(insertOf('CPMT 090300').clearanceDeg, 11);
  const sharp = insertOf('CNMG 120400'); assert.equal(sharp.noseRadiusMm, 0); assert.equal(sharp.sharpCorner, true);
  assert.equal(insertOf('CNMG 120412').noseRadiusMm, 1.2); assert.equal(insertOf('CNMG 120416').noseRadiusMm, 1.6);
  assert.equal(insertOf('  cnmg 1204 08 ').code, 'CNMG 120408');
});

test('edge length formula reduces to the closed forms per shape', () => {
  const sin = (d: number) => Math.sin(d * Math.PI / 180);
  for (const [shape, e] of [['C', 80], ['D', 55], ['V', 35], ['E', 75], ['M', 86]] as const) close(edgeLengthMm(shape, 12.7), 12.7 / sin(e));
  close(edgeLengthMm('T', 9.525), 9.525 * Math.sqrt(3));
  close(edgeLengthMm('S', 12.7), 12.7);
  close(edgeLengthMm('W', 12.7), 6.35 * (1 / Math.tan(40 * Math.PI / 180) + 1 / Math.tan(80 * Math.PI / 180)));
});

test('invalid insert designations return structured Spanish errors and never throw', () => {
  const cases: [unknown, string][] = [
    ['', 'empty'], ['CNMG', 'format'], ['CNMG 120408-PM', 'format'], ['RCMT 1204M0', 'format'], ['RCMT 120400', 'shape-unsupported'],
    ['ZNMG 120408', 'shape-unknown'], ['COMG 120408', 'clearance'], ['CNZG 120408', 'tolerance'], ['CNMZ 120408', 'type'],
    ['CNMG 130408', 'size'], ['CNMG 120808', 'thickness'], [null, 'empty'], [42, 'empty'],
  ];
  for (const [code, expected] of cases) {
    const r = parseInsertDesignation(code as string);
    assert.equal(r.ok, false, String(code));
    if (!r.ok) { assert.equal(r.error.code, expected, String(code)); assert.ok(r.error.message.length > 10); }
  }
  const r = parseInsertDesignation('RCMT 120400');
  assert.ok(!r.ok && /redondos/.test(r.error.message));
});

test('ISO 5608 holders decode clamping, style κr, hand, shank and length', () => {
  const p = holderOf('PCLNR 2020K12');
  assert.equal(p.clampingLetter, 'P'); assert.equal(p.shape, 'C'); assert.equal(p.kappaRDeg, 95); assert.equal(p.clearanceDeg, 0);
  assert.equal(p.hand, 'R'); assert.equal(p.shankHeightMm, 20); assert.equal(p.shankWidthMm, 20); assert.equal(p.lengthMm, 125);
  assert.equal(p.sizeCode, '12');
  const s = holderOf('svjbr 2525M16');
  assert.equal(s.kappaRDeg, 93); assert.equal(s.clearanceDeg, 5); assert.equal(s.lengthMm, 150); assert.equal(s.shankHeightMm, 25);
  const d = holderOf('DDJNL 2020K15'); assert.equal(d.hand, 'L'); assert.equal(d.clampingLetter, 'D');
  const t = holderOf('PTGNR 1616H16'); assert.equal(t.kappaRDeg, 90); assert.equal(t.lengthMm, 100); assert.equal(t.shankWidthMm, 16);
  const kappa: Record<string, number> = { A: 90, B: 75, D: 45, E: 60, F: 90, G: 90, J: 93, K: 75, L: 95, N: 63, R: 75, S: 45, T: 60, U: 93, V: 72.5, Y: 85 };
  for (const [style, k] of Object.entries(kappa)) assert.equal(holderOf(`PC${style}NR 2020K12`).kappaRDeg, k, style);
  const lengths: Record<string, number> = { H: 100, K: 125, M: 150, P: 170, Q: 180, R: 200, S: 250 };
  for (const [letter, l] of Object.entries(lengths)) assert.equal(holderOf(`PCLNR 2525${letter}12`).lengthMm, l);
  assert.equal(holderOf('MTJNR 3225P16').shankHeightMm, 32); assert.equal(holderOf('MTJNR 3225P16').shankWidthMm, 25);
});

test('invalid holder designations return structured Spanish errors', () => {
  const cases: [string, string][] = [
    ['', 'empty'], ['PCLNR 2020K', 'format'], ['ZCLNR 2020K12', 'clamping'], ['PRLNR 2020K12', 'shape'],
    ['PCZNR 2020K12', 'style'], ['PCLOR 2020K12', 'clearance'], ['PCLNX 2020K12', 'hand'], ['PCLNR 0020K12', 'shank'],
    ['PCLNR 2020X12', 'length'],
  ];
  for (const [code, expected] of cases) {
    const r = parseHolderDesignation(code);
    assert.equal(r.ok, false, code);
    if (!r.ok) assert.equal(r.error.code, expected, code);
  }
});

test('compatibility checks shape, clearance and edge size code', () => {
  const c = insertOf('CNMG 120408');
  assert.equal(checkCompatibility(c, holderOf('PCLNR 2020K12')), null);
  assert.equal(checkCompatibility(c, holderOf('PDJNR 2020K15'))?.code, 'shape-mismatch');
  assert.equal(checkCompatibility(c, holderOf('SCLCR 2020K12'))?.code, 'clearance-mismatch');
  assert.equal(checkCompatibility(c, holderOf('PCLNR 2020K09'))?.code, 'size-mismatch');
  const r = isoAssembly(c, holderOf('PDJNR 2020K15'));
  assert.ok(!r.ok && /forma D/.test(r.error.message));
  const left = isoAssembly(insertOf('DNMG 150608'), holderOf('DDJNL 2020K15'));
  assert.ok(!left.ok && left.error.code === 'hand');
  const facing = isoAssembly(c, holderOf('PCKNR 2020K12'));
  assert.ok(!facing.ok && facing.error.code === 'style-facing');
  const head = isoAssembly(c, holderOf('PCLNR 2020K12'), { headLengthMm: 500 });
  assert.ok(!head.ok && head.error.code === 'head-length');
});

function geometry(insertCode: string, holderCode: string) {
  const insert = insertOf(insertCode); const holder = holderOf(holderCode);
  const r = isoAssembly(insert, holder);
  assert.ok(r.ok, r.ok ? '' : r.error.message);
  const a = r.value;
  const ins = a.parts.find(p => p.role === 'insert')!;
  assert.equal(ins.kind, 'prism');
  const outline = partOutline(ins);
  return { a, insert, holder, ins, outline };
}

test('iso assembly: insert polygon, κr orientation, shank and provenance', () => {
  const combos: [string, string, number][] = [
    ['CNMG 120408', 'PCLNR 2020K12', 4], ['DNMG 150604', 'DDJNR 2020K15', 4], ['VBMT 160404', 'SVJBR 2525M16', 4],
    ['TNMG 160408', 'PTGNR 1616H16', 3], ['WNMG 080408', 'PWLNR 2020K08', 6], ['SNMG 120408', 'PSSNR 2525M12', 4],
  ];
  for (const [ic, hc, expectedVertices] of combos) {
    const { a, insert, holder, ins, outline } = geometry(ic, hc);
    assert.equal(a.provenance, 'iso-nominal');
    assert.match(a.dimensions, /Nominal ISO, no datos de fabricante/);
    assert.equal(a.noseRadiusMm, insert.noseRadiusMm);
    assert.deepEqual(outline[0], [0, 0]);
    assert.equal(outline.length, expectedVertices);
    // Point angle at the ideal corner, between the first and last edges.
    close(angleBetween(outline[1], outline.at(-1)!), insert.pointAngleDeg);
    // Major cutting edge (last vertex → corner) makes κr with the feed direction −Z.
    close(angleBetween(outline.at(-1)!, [-1, 0]), holder.kappaRDeg);
    // Every side equals the nominal edge length from IC; the insert stays on the +R side (outside the part).
    for (let i = 0; i < outline.length; i++) close(Math.hypot(outline[(i + 1) % outline.length][0] - outline[i][0], outline[(i + 1) % outline.length][1] - outline[i][1]), insert.edgeLengthMm);
    assert.ok(outline.every(([, r]) => r >= -1e-9));
    if (ins.kind === 'prism') { assert.equal(ins.thicknessMm, insert.thicknessMm); close(ins.tangentialCenterMm, -insert.thicknessMm / 2); }
    const [shank, head] = a.parts;
    assert.ok(shank.kind === 'prism' && head.kind === 'prism');
    if (shank.kind === 'prism') {
      const zs = shank.outline.map(p => p[0]); const rs = shank.outline.map(p => p[1]);
      close(Math.max(...zs) - Math.min(...zs), holder.shankWidthMm);
      close(Math.max(...zs), a.offsetFMm);
      close(Math.max(...rs), holder.lengthMm);
      close(Math.min(...rs), a.headLengthMm);
      assert.equal(shank.thicknessMm, holder.shankHeightMm);
      close(shank.tangentialCenterMm + shank.thicknessMm / 2, 0); // top face at corner height
    }
    if (head.kind === 'prism') {
      assert.ok(!head.outline.some(([z, r]) => Math.hypot(z, r) < 1e-6), 'head does not cover the cutting corner');
      close(head.thicknessMm + insert.thicknessMm, holder.shankHeightMm);
    }
    // Compatible with the existing geometry helpers.
    const bounds = assemblyBounds(a as unknown as ToolAssembly);
    close(bounds.maxR, holder.lengthMm);
  }
});

test('educational head length and offset f are explicit defaults and can be overridden', () => {
  const { a, insert, holder } = geometry('CNMG 120408', 'PCLNR 2020K12');
  close(a.headLengthMm, 2.5 * insert.icMm); close(a.offsetFMm, 1.25 * holder.shankWidthMm);
  assert.deepEqual(a.educationalParameters, ['headLengthMm', 'offsetFMm']);
  const r = isoAssembly(insert, holder, { headLengthMm: 30, offsetFMm: 25, id: 'roughing-od' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.id, 'roughing-od');
    const shank = r.value.parts[0];
    assert.ok(shank.kind === 'prism');
    if (shank.kind === 'prism') assert.deepEqual(shank.outline, [[5, 30], [25, 30], [25, 125], [5, 125]]);
  }
});
