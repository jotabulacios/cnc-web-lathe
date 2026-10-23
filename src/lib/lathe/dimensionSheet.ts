import type { DisplayProfile } from './annularProfile.ts';

/** Dimension sheet ("hoja de cotas") derived from an already resolved profile.
 * Pure geometry on physical radius/Z millimetres: no CNC semantics, no material
 * removal. Lengths use parallel (baseline) dimensioning from the part's front face. */

/** Below this length (mm) or diameter step a span is treated as numerical noise. */
export const SLIVER_MM = 0.01;
/** Perpendicular deviation (mm, = half a 0.01 mm diameter step) accepted when merging collinear spans. */
const COLLINEAR_MM = SLIVER_MM / 2;
/** Arc chords from the engine have ≤ 0.01 mm sagitta; vertices must lie this close to the fitted circle. */
const ARC_FIT_MM = 0.02;
/** Maximum central angle per chord: rejects long polylines that happen to be concyclic (e.g. symmetric grooves). */
const ARC_MAX_CHORD_RAD = Math.PI / 6;
const CHAMFER_MAX_MM = 3;
const CHAMFER_ANGLE_TOL_DEG = 0.5;
/** Chain membership: chords up to 5 mm (0.01 mm sagitta up to R ≈ 300 mm) turning ≤ 20° per vertex. */
const CHORD_MAX_MM = 5;
const CHAIN_MAX_TURN_RAD = Math.PI / 9;

type Segment = { zStartMm: number; zEndMm: number; rStartMm: number; rEndMm: number };
export type FeatureKind = 'cylinder' | 'cone' | 'chamfer' | 'arc' | 'curve';
export type Feature = Segment & {
  kind: FeatureKind;
  /** Cones and chamfers: half (semi) angle against the axis, degrees. */
  halfAngleDeg?: number;
  arc?: { radiusMm: number; centerZMm: number; centerRMm: number; convex: boolean };
};
export type Contour = 'outer' | 'inner';
export type Placement = 'right' | 'left' | 'inside';
export type DiameterDim = { contour: Contour; zMm: number; radiusMm: number; diameterMm: number; text: string; placement: Placement };
export type LengthDim = { contour: Contour; fromZMm: number; toZMm: number; valueMm: number; text: string };
export type NoteKind = 'taper' | 'chamfer' | 'arc' | 'curve' | 'face';
export type Note = { contour: Contour; kind: NoteKind; zMm: number; rMm: number; text: string };
export type DimensionSheet = {
  tubular: boolean;
  outer: Feature[];
  inner: Feature[];
  /** Material extent: front face (largest Z) and back face. */
  frontZMm: number;
  backZMm: number;
  overallLengthMm: number;
  maxRadiusMm: number;
  diameters: DiameterDim[];
  lengths: LengthDim[];
  notes: Note[];
};

/** Display rounding to 0.01 with the UI's Argentine decimal comma; never shows "-0". */
export function formatMm(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
}
export const formatDiameter = (diameterMm: number) => `Ø${formatMm(diameterMm)}`;

const lengthOf = (s: Segment) => s.zEndMm - s.zStartMm;
const slopeOf = (s: Segment) => (s.rEndMm - s.rStartMm) / lengthOf(s);
const radiusAt = (s: Segment, z: number) => s.rStartMm + slopeOf(s) * (z - s.zStartMm);

/** Absorb sub-0.01 mm spans into a neighbour by extending its own line. */
function dropSlivers(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  let pendingStart: number | null = null;
  for (const segment of segments) {
    if (lengthOf(segment) < SLIVER_MM) {
      const previous = out.at(-1);
      if (previous) { previous.rEndMm = radiusAt(previous, segment.zEndMm); previous.zEndMm = segment.zEndMm; }
      else pendingStart ??= segment.zStartMm;
      continue;
    }
    const next = { ...segment };
    if (pendingStart !== null) { next.rStartMm = radiusAt(segment, pendingStart); next.zStartMm = pendingStart; pendingStart = null; }
    out.push(next);
  }
  return out;
}

/** Merge contiguous spans whose every original vertex lies on one straight line. */
function mergeCollinear(segments: readonly Segment[]): Segment[] {
  const out: { segment: Segment; vertices: [number, number][] }[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (last && Math.abs(last.segment.rEndMm - segment.rStartMm) <= COLLINEAR_MM) {
      const merged = { zStartMm: last.segment.zStartMm, zEndMm: segment.zEndMm, rStartMm: last.segment.rStartMm, rEndMm: segment.rEndMm };
      const vertices: [number, number][] = [...last.vertices, [segment.zStartMm, segment.rStartMm]];
      const k = Math.sqrt(1 + slopeOf(merged) ** 2);
      if (vertices.every(([z, r]) => Math.abs(r - radiusAt(merged, z)) / k <= COLLINEAR_MM)) {
        last.segment = merged;
        last.vertices = vertices;
        continue;
      }
    }
    out.push({ segment: { ...segment }, vertices: [] });
  }
  return out.map(item => item.segment);
}

function circleThrough(a: [number, number], b: [number, number], c: [number, number]) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const sq = (p: [number, number]) => p[0] * p[0] + p[1] * p[1];
  const z = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const r = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  return { z, r, radius: Math.hypot(a[0] - z, a[1] - r) };
}

/** Fit one circle to a contiguous run of chords; null unless every guard holds. */
function fitArc(run: readonly Segment[]) {
  if (run.length < 3) return null;
  for (let i = 1; i < run.length; i++) if (Math.abs(run[i - 1].rEndMm - run[i].rStartMm) > COLLINEAR_MM) return null;
  const vertices: [number, number][] = [[run[0].zStartMm, run[0].rStartMm], ...run.map(s => [s.zEndMm, s.rEndMm] as [number, number])];
  // Consistent turning direction along the run.
  let sign = 0;
  for (let i = 1; i < vertices.length - 1; i++) {
    const [a, b, c] = [vertices[i - 1], vertices[i], vertices[i + 1]];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const s = Math.sign(cross);
    if (s === 0 || (sign !== 0 && s !== sign)) return null;
    sign = s;
  }
  const circle = circleThrough(vertices[0], vertices[Math.floor(vertices.length / 2)], vertices.at(-1)!);
  if (!circle || !Number.isFinite(circle.radius) || circle.radius > 1e4) return null;
  if (vertices.some(([z, r]) => Math.abs(Math.hypot(z - circle.z, r - circle.r) - circle.radius) > ARC_FIT_MM)) return null;
  const chords = run.map(s => Math.hypot(lengthOf(s), s.rEndMm - s.rStartMm));
  if (chords.some(c => 2 * Math.asin(Math.min(1, c / (2 * circle.radius))) > ARC_MAX_CHORD_RAD)) return null;
  if (Math.max(...chords) > 3 * Math.min(...chords)) return null;
  return circle;
}

const flat = (s: Segment) => Math.abs(s.rEndMm - s.rStartMm) <= COLLINEAR_MM;
const chordLength = (s: Segment) => Math.hypot(lengthOf(s), s.rEndMm - s.rStartMm);
/** Two neighbours belong to one flattened curve: contiguous, short, similar length and a gentle turn. */
function chained(a: Segment, b: Segment): boolean {
  if (flat(a) || flat(b) || Math.abs(a.rEndMm - b.rStartMm) > COLLINEAR_MM) return false;
  const [la, lb] = [chordLength(a), chordLength(b)];
  if (la > CHORD_MAX_MM || lb > CHORD_MAX_MM || Math.max(la, lb) > 3 * Math.min(la, lb)) return false;
  const turn = Math.abs(Math.atan(slopeOf(b)) - Math.atan(slopeOf(a)));
  return turn <= CHAIN_MAX_TURN_RAD;
}

/** Classify a cleaned contour; `contour` decides convexity (material below vs. above the contour).
 * A chain of ≥ 3 chords is one arc only if the whole chain fits one circle, otherwise a generic
 * curve: partial circle fits inside a longer chain are never reported as radii. */
function classify(segments: readonly Segment[], contour: Contour): Feature[] {
  const features: Feature[] = [];
  let i = 0;
  while (i < segments.length) {
    let end = i + 1;
    while (end < segments.length && chained(segments[end - 1], segments[end])) end++;
    if (end - i >= 3) {
      const run = segments.slice(i, end);
      const first = run[0]; const last = run.at(-1)!;
      const circle = fitArc(run);
      if (circle) {
        const middle = run[Math.floor(run.length / 2)];
        const contourR = (middle.rStartMm + middle.rEndMm) / 2;
        features.push({ kind: 'arc', zStartMm: first.zStartMm, zEndMm: last.zEndMm, rStartMm: first.rStartMm, rEndMm: last.rEndMm,
          arc: { radiusMm: circle.radius, centerZMm: circle.z, centerRMm: circle.r, convex: contour === 'outer' ? circle.r < contourR : circle.r > contourR } });
      } else features.push({ kind: 'curve', zStartMm: first.zStartMm, zEndMm: last.zEndMm, rStartMm: first.rStartMm, rEndMm: last.rEndMm });
      i = end;
      continue;
    }
    const s = segments[i];
    const rise = s.rEndMm - s.rStartMm;
    if (Math.abs(rise) <= COLLINEAR_MM) {
      const r = (s.rStartMm + s.rEndMm) / 2;
      features.push({ ...s, rStartMm: r, rEndMm: r, kind: 'cylinder' });
    } else {
      const halfAngleDeg = Math.atan(Math.abs(rise) / lengthOf(s)) * 180 / Math.PI;
      const chamfer = Math.abs(halfAngleDeg - 45) <= CHAMFER_ANGLE_TOL_DEG && lengthOf(s) <= CHAMFER_MAX_MM;
      features.push({ ...s, kind: chamfer ? 'chamfer' : 'cone', halfAngleDeg });
    }
    i++;
  }
  return features;
}

const clean = (segments: readonly Segment[], contour: Contour) => classify(mergeCollinear(dropSlivers(segments)), contour);

/** Largest radius of `features` strictly inside (a, b); endpoints themselves are excluded. */
function maxRadiusBetween(features: readonly Feature[], a: number, b: number): number {
  const lo = a + 1e-6; const hi = b - 1e-6;
  let max = 0;
  for (const f of features) {
    if (f.zEndMm <= lo || f.zStartMm >= hi) continue;
    const z1 = Math.max(lo, f.zStartMm); const z2 = Math.min(hi, f.zEndMm);
    max = Math.max(max, radiusAt(f, z1), radiusAt(f, z2));
  }
  return max;
}

/** Outer diameters go to whichever side their extension lines reach without crossing
 * material (the nearer face if both); `zLeft`/`zRight` are the feature's own ends. */
function placeOuter(features: readonly Feature[], zLeft: number, zRight: number, radiusMm: number, front: number, back: number): Placement {
  const right = maxRadiusBetween(features, zRight, front + 1) <= radiusMm + COLLINEAR_MM;
  const left = maxRadiusBetween(features, back - 1, zLeft) <= radiusMm + COLLINEAR_MM;
  if (right && left) return front - zRight <= zLeft - back ? 'right' : 'left';
  return right ? 'right' : left ? 'left' : 'inside';
}

const same = (a: number, b: number) => Math.abs(a - b) <= COLLINEAR_MM;
const angleText = (deg: number) => `${formatMm(deg)}°`;

function contourDimensions(features: readonly Feature[], contour: Contour, front: number, back: number) {
  const diameters: DiameterDim[] = [];
  const notes: Note[] = [];
  const addDiameter = (zLeft: number, zRight: number, radiusMm: number) => {
    if (radiusMm <= COLLINEAR_MM) return;
    const placement = contour === 'inner' ? 'inside' : placeOuter(features, zLeft, zRight, radiusMm, front, back);
    // Extension lines leave from the end nearest the chosen side.
    const zMm = placement === 'left' ? zLeft : placement === 'right' ? zRight : (zLeft + zRight) / 2;
    if (diameters.some(d => same(d.zMm, zMm) && same(d.radiusMm, radiusMm))) return;
    diameters.push({ contour, zMm, radiusMm, diameterMm: radiusMm * 2, text: formatDiameter(radiusMm * 2), placement });
  };
  features.forEach((f, index) => {
    const length = lengthOf(f);
    const mid = (f.zStartMm + f.zEndMm) / 2;
    if (f.kind === 'cylinder') {
      addDiameter(f.zStartMm, f.zEndMm, f.rStartMm);
      return;
    }
    if (f.kind === 'cone' || f.kind === 'curve') {
      // An end shared with a same-diameter cylinder is already dimensioned there.
      const previous = features[index - 1]; const next = features[index + 1];
      const coveredStart = previous?.kind === 'cylinder' && same(previous.zEndMm, f.zStartMm) && same(previous.rEndMm, f.rStartMm);
      const coveredEnd = next?.kind === 'cylinder' && same(next.zStartMm, f.zEndMm) && same(next.rStartMm, f.rEndMm);
      if (!coveredStart) addDiameter(f.zStartMm, f.zStartMm, f.rStartMm);
      if (!coveredEnd) addDiameter(f.zEndMm, f.zEndMm, f.rEndMm);
    }
    const rMid = (f.rStartMm + f.rEndMm) / 2;
    if (f.kind === 'cone') {
      const half = f.halfAngleDeg!;
      const deltaD = Math.abs(f.rEndMm - f.rStartMm) * 2;
      notes.push({ contour, kind: 'taper', zMm: mid, rMm: rMid,
        // Taper ratio 1:x only for gentle cones, where shops actually specify it.
        text: `Cono α/2 = ${angleText(half)} (incl. ${angleText(2 * half)})${half <= 30 ? ` · 1:${formatMm(length / deltaD)}` : ''}` });
    } else if (f.kind === 'chamfer') {
      notes.push({ contour, kind: 'chamfer', zMm: mid, rMm: rMid, text: `Chaflán ${formatMm(length)} × 45°` });
    } else if (f.kind === 'arc') {
      notes.push({ contour, kind: 'arc', zMm: mid, rMm: rMid, text: `R${formatMm(f.arc!.radiusMm)} ${f.arc!.convex ? 'convexo' : 'cóncavo'}` });
    } else if (f.kind === 'curve') {
      notes.push({ contour, kind: 'curve', zMm: mid, rMm: rMid, text: 'Perfil curvo' });
    }
  });
  return { diameters, notes };
}

type Run = { zStartMm: number; zEndMm: number; outer: Segment[]; inner: Segment[] };

/** Build the sheet, or null when the profile holds no material. */
export function buildDimensionSheet(profile: DisplayProfile): DimensionSheet | null {
  const tubular = profile.profileVersion === 3;
  const rows = profile.profileVersion === 3
    ? profile.spans.map(s => ({ z: [s.zStartMm, s.zEndMm], outer: [s.outerStartMm, s.outerEndMm], inner: [s.innerStartMm, s.innerEndMm] }))
    : profile.spans.map(s => ({ z: [s.zStartMm, s.zEndMm], outer: [s.rStartMm, s.rEndMm], inner: [0, 0] }));
  // Gaps (no material) split independent runs: faced-off ends or zero-thickness walls.
  const runs: Run[] = [];
  let run: Run | null = null;
  for (const row of rows) {
    const empty = row.outer[0] - row.inner[0] <= 1e-9 && row.outer[1] - row.inner[1] <= 1e-9;
    if (empty) { run = null; continue; }
    if (!run) { run = { zStartMm: row.z[0], zEndMm: row.z[1], outer: [], inner: [] }; runs.push(run); }
    run.zEndMm = row.z[1];
    run.outer.push({ zStartMm: row.z[0], zEndMm: row.z[1], rStartMm: row.outer[0], rEndMm: row.outer[1] });
    run.inner.push({ zStartMm: row.z[0], zEndMm: row.z[1], rStartMm: row.inner[0], rEndMm: row.inner[1] });
  }
  const material = runs.filter(r => r.zEndMm - r.zStartMm >= SLIVER_MM);
  if (!material.length) return null;
  const outer = material.flatMap(r => clean(r.outer, 'outer'));
  const inner = tubular ? material.flatMap(r => clean(r.inner, 'inner')) : [];
  const frontZMm = material.at(-1)!.zEndMm;
  const backZMm = material[0].zStartMm;
  const outerDims = contourDimensions(outer, 'outer', frontZMm, backZMm);
  const innerDims = contourDimensions(inner, 'inner', frontZMm, backZMm);
  // Baseline dimensioning: every exterior boundary measured from the front face.
  const outerZ = [...new Set([...outer.map(f => f.zStartMm), ...material.map(r => r.zEndMm)])].filter(z => !same(z, frontZMm));
  const innerZ = [...new Set(inner.map(f => f.zStartMm))].filter(z => !same(z, frontZMm) && !same(z, backZMm) && !outerZ.some(o => same(o, z)));
  const toLength = (contour: Contour) => (z: number): LengthDim => ({ contour, fromZMm: frontZMm, toZMm: z, valueMm: frontZMm - z, text: formatMm(frontZMm - z) });
  const lengths = [...dedupe(outerZ).map(toLength('outer')), ...dedupe(innerZ).map(toLength('inner'))].sort((a, b) => a.valueMm - b.valueMm);
  const notes = [...outerDims.notes, ...innerDims.notes];
  if (frontZMm < -SLIVER_MM) {
    notes.push({ contour: 'outer', kind: 'face', zMm: frontZMm, rMm: outer.at(-1)!.rEndMm, text: `Cara frontal en Z${formatMm(frontZMm).replace('-', '−')}` });
  }
  return {
    tubular, outer, inner, frontZMm, backZMm, overallLengthMm: frontZMm - backZMm,
    maxRadiusMm: Math.max(...outer.map(f => Math.max(f.rStartMm, f.rEndMm))),
    diameters: [...outerDims.diameters, ...innerDims.diameters], lengths, notes,
  };
}

function dedupe(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => b - a)) if (!out.some(o => same(o, v))) out.push(v);
  return out;
}
