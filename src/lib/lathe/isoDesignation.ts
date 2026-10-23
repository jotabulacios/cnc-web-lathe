import type { ToolId } from './contract.ts';
import type { ToolAssembly, ToolPart, ToolPoint } from './toolAssemblies.ts';

/**
 * Nominal interpretation of ISO 1832 (indexable inserts) and ISO 5608 (external turning holders)
 * designation codes, for an educational simulator. Only the public meaning of each code position is
 * used; no manufacturer data, catalogue tables or trademarks. Values are NOMINAL (no tolerances) and
 * dimensions that ISO does not fix (holder head length, offset f) are explicit educational parameters.
 * Nothing here is machine-safe or industrially validated.
 *
 * Local assembly coordinates follow toolAssemblies.ts: Z axial, R radial, tangential = third axis;
 * the ideal (sharp) tool corner is the origin. Angles in the Z-R plane are measured from +Z toward +R.
 */

export type IsoError = { code: string; message: string };
export type IsoResult<T> = { ok: true; value: T } | { ok: false; error: IsoError };
const fail = <T>(code: string, message: string): IsoResult<T> => ({ ok: false, error: { code, message } });

/** Supported insert shapes. Round (R) and the remaining ISO shapes are rejected with a diagnostic. */
export type InsertPolygonKind = 'rhombic' | 'triangle' | 'square' | 'trigon';
const SHAPES: Record<string, { pointAngleDeg: number; kind: InsertPolygonKind }> = {
  C: { pointAngleDeg: 80, kind: 'rhombic' },
  D: { pointAngleDeg: 55, kind: 'rhombic' },
  E: { pointAngleDeg: 75, kind: 'rhombic' },
  M: { pointAngleDeg: 86, kind: 'rhombic' },
  V: { pointAngleDeg: 35, kind: 'rhombic' },
  S: { pointAngleDeg: 90, kind: 'square' },
  T: { pointAngleDeg: 60, kind: 'triangle' },
  W: { pointAngleDeg: 80, kind: 'trigon' },
};
const KNOWN_UNSUPPORTED_SHAPES = new Set(['R', 'H', 'O', 'P', 'L', 'A', 'B', 'K']);
/** Normal clearance angle of the insert (ISO 1832 position 2). O (other) is not interpretable. */
const CLEARANCE_DEG: Record<string, number> = { A: 3, B: 5, C: 7, D: 15, E: 20, F: 25, G: 30, N: 0, P: 11 };
const TOLERANCE_CLASSES = new Set(['A', 'F', 'C', 'H', 'E', 'G', 'J', 'K', 'L', 'M', 'N', 'U']);
const INSERT_TYPES = new Set(['A', 'B', 'C', 'F', 'G', 'H', 'J', 'M', 'N', 'Q', 'R', 'T', 'U', 'W']);
/** Thickness code (truncated mm, T = intermediate size) → nominal thickness; values are inch fractions. */
const THICKNESS_MM: Record<string, number> = {
  '01': 1.59, T1: 1.98, '02': 2.38, T2: 2.78, '03': 3.18, T3: 3.97, '04': 4.76, '05': 5.56,
  '06': 6.35, '07': 7.94, '09': 9.52,
};
/** Nominal inscribed-circle series (inch fractions 5/32″ … 1 1/4″, in mm). */
export const IC_SERIES_MM = [3.969, 4.763, 5.556, 6.35, 7.938, 9.525, 12.7, 15.875, 19.05, 25.4, 31.75] as const;

const DEG = Math.PI / 180;
const cot = (deg: number) => 1 / Math.tan(deg * DEG);

/** Interior angles of the insert polygon, starting at the cutting corner and walking CCW. */
function vertexAngles(shape: string): number[] {
  const { pointAngleDeg: e, kind } = SHAPES[shape];
  if (kind === 'rhombic') return [e, 180 - e, e, 180 - e];
  if (kind === 'triangle') return [60, 60, 60];
  if (kind === 'square') return [90, 90, 90, 90];
  return [80, 160, 80, 160, 80, 160];
}

/**
 * Edge length of the (equilateral, tangential) insert polygon from its inscribed circle.
 * Each side touches the inscribed circle; the tangent length from a vertex with interior angle α is
 * r·cot(α/2), so a side between angles α and β measures r·(cot(α/2) + cot(β/2)), r = IC/2.
 * Rhombus ε: IC/sin ε · triangle: IC·√3 · square: IC · trigon 80°/160°: (IC/2)(cot 40° + cot 80°).
 */
export function edgeLengthMm(shape: string, icMm: number): number {
  const [a, b] = vertexAngles(shape);
  return icMm / 2 * (cot(a / 2) + cot(b / 2));
}

/** ISO size code of an edge length: nominal edge rounded to 0.1 mm, then truncated to whole mm.
 * The 0.1 mm rounding reproduces published codes such as T, IC 6.35 → l = 10.998 → "11". */
export function sizeCodeOf(shape: string, icMm: number): number {
  return Math.floor(Math.round(edgeLengthMm(shape, icMm) * 10) / 10 + 1e-9);
}

export type InsertDesignation = {
  code: string; shape: string; pointAngleDeg: number; polygon: InsertPolygonKind;
  clearanceLetter: string; clearanceDeg: number; toleranceClass: string; typeLetter: string;
  sizeCode: string; icMm: number; edgeLengthMm: number;
  thicknessCode: string; thicknessMm: number;
  noseRadiusCode: string; noseRadiusMm: number; sharpCorner: boolean;
  provenance: 'iso-nominal';
};

function normalise(code: unknown): string | null {
  return typeof code === 'string' ? code.replace(/\s+/g, '').toUpperCase() : null;
}

export function parseInsertDesignation(code: string): IsoResult<InsertDesignation> {
  const c = normalise(code);
  if (c === null || c.length === 0) return fail('empty', 'Ingresá una designación de inserto ISO 1832, por ejemplo CNMG 120408.');
  const m = /^([A-Z])([A-Z])([A-Z])([A-Z])(\d{2})([0-9T]\d)(\d{2})$/.exec(c);
  if (!m) return fail('format', `«${code}» no tiene el formato ISO 1832 admitido: cuatro letras, tamaño (2 dígitos), espesor (2) y radio (2), p. ej. CNMG 120408. No se interpretan sufijos de rompevirutas.`);
  const [, shape, clearance, tolerance, type, size, thick, nose] = m;
  if (!SHAPES[shape]) {
    return KNOWN_UNSUPPORTED_SHAPES.has(shape)
      ? fail('shape-unsupported', `La forma «${shape}» existe en ISO 1832 pero no está admitida (solo C, D, E, M, V, S, T, W; los insertos redondos R no tienen punta).`)
      : fail('shape-unknown', `Letra de forma desconocida: «${shape}».`);
  }
  if (CLEARANCE_DEG[clearance] === undefined) return fail('clearance', `Letra de ángulo de incidencia no admitida: «${clearance}».`);
  if (!TOLERANCE_CLASSES.has(tolerance)) return fail('tolerance', `Clase de tolerancia desconocida: «${tolerance}».`);
  if (!INSERT_TYPES.has(type)) return fail('type', `Tipo de inserto (fijación/rompevirutas) desconocido o especial: «${type}».`);
  const sizeN = Number(size);
  const icMm = IC_SERIES_MM.find(ic => sizeCodeOf(shape, ic) === sizeN);
  if (icMm === undefined) return fail('size', `El tamaño «${size}» no corresponde a ningún círculo inscrito nominal para la forma ${shape}.`);
  const thicknessMm = THICKNESS_MM[thick];
  if (thicknessMm === undefined) return fail('thickness', `Código de espesor desconocido: «${thick}».`);
  const noseRadiusMm = Number(nose) / 10;
  return { ok: true, value: {
    code: `${shape}${clearance}${tolerance}${type} ${size}${thick}${nose}`, shape,
    pointAngleDeg: SHAPES[shape].pointAngleDeg, polygon: SHAPES[shape].kind,
    clearanceLetter: clearance, clearanceDeg: CLEARANCE_DEG[clearance], toleranceClass: tolerance, typeLetter: type,
    sizeCode: size, icMm, edgeLengthMm: edgeLengthMm(shape, icMm),
    thicknessCode: thick, thicknessMm, noseRadiusCode: nose, noseRadiusMm, sharpCorner: noseRadiusMm === 0,
    provenance: 'iso-nominal',
  } };
}

/** Holder style (ISO 5608 position 3) → approach angle κr. `feed` is the main feed direction the
 * angle refers to: longitudinal (−Z for right hand), facing (radial) or both. */
export type HolderFeed = 'longitudinal' | 'facing' | 'both';
const STYLES: Record<string, { kappaRDeg: number; feed: HolderFeed }> = {
  A: { kappaRDeg: 90, feed: 'longitudinal' }, B: { kappaRDeg: 75, feed: 'longitudinal' },
  D: { kappaRDeg: 45, feed: 'both' }, E: { kappaRDeg: 60, feed: 'longitudinal' },
  F: { kappaRDeg: 90, feed: 'facing' }, G: { kappaRDeg: 90, feed: 'longitudinal' },
  J: { kappaRDeg: 93, feed: 'longitudinal' }, K: { kappaRDeg: 75, feed: 'facing' },
  L: { kappaRDeg: 95, feed: 'both' }, N: { kappaRDeg: 63, feed: 'longitudinal' },
  R: { kappaRDeg: 75, feed: 'longitudinal' }, S: { kappaRDeg: 45, feed: 'longitudinal' },
  T: { kappaRDeg: 60, feed: 'longitudinal' }, U: { kappaRDeg: 93, feed: 'longitudinal' },
  V: { kappaRDeg: 72.5, feed: 'longitudinal' }, Y: { kappaRDeg: 85, feed: 'longitudinal' },
};
const CLAMPING: Record<string, string> = {
  C: 'brida superior', M: 'brida superior y perno', P: 'palanca por agujero', S: 'tornillo pasante', D: 'brida rígida doble',
};
/** Tool length letter (ISO 5608 position 9) → overall length l1 in mm. X (special) is not interpretable. */
const LENGTH_MM: Record<string, number> = {
  A: 32, B: 40, C: 50, D: 60, E: 70, F: 80, G: 90, H: 100, J: 110, K: 125, L: 140, M: 150,
  N: 160, P: 170, Q: 180, R: 200, S: 250, T: 300, U: 350, V: 400, W: 450, Y: 500,
};

export type HolderDesignation = {
  code: string; clampingLetter: string; clamping: string; shape: string;
  styleLetter: string; kappaRDeg: number; feed: HolderFeed; clearanceLetter: string; clearanceDeg: number;
  hand: 'R' | 'L' | 'N'; shankHeightMm: number; shankWidthMm: number; lengthLetter: string; lengthMm: number;
  sizeCode: string; provenance: 'iso-nominal';
};

export function parseHolderDesignation(code: string): IsoResult<HolderDesignation> {
  const c = normalise(code);
  if (c === null || c.length === 0) return fail('empty', 'Ingresá una designación de portaherramientas ISO 5608, por ejemplo PCLNR 2020K12.');
  const m = /^([A-Z])([A-Z])([A-Z])([A-Z])([A-Z])(\d{2})(\d{2})([A-Z])(\d{2})$/.exec(c);
  if (!m) return fail('format', `«${code}» no tiene el formato ISO 5608 admitido: cinco letras, alto y ancho del mango (4 dígitos), letra de largo y tamaño de filo, p. ej. PCLNR 2020K12.`);
  const [, clamp, shape, style, clearance, hand, h, b, len, size] = m;
  if (!CLAMPING[clamp]) return fail('clamping', `Sistema de sujeción desconocido: «${clamp}».`);
  if (!SHAPES[shape]) return fail('shape', `Forma de inserto «${shape}» no admitida en el porta (solo C, D, E, M, V, S, T, W).`);
  if (!STYLES[style]) return fail('style', `Estilo de porta «${style}» no admitido; no se conoce su ángulo de posición κr.`);
  if (CLEARANCE_DEG[clearance] === undefined) return fail('clearance', `Letra de incidencia del inserto no admitida: «${clearance}».`);
  if (hand !== 'R' && hand !== 'L' && hand !== 'N') return fail('hand', `Mano desconocida: «${hand}» (R, L o N).`);
  const shankHeightMm = Number(h); const shankWidthMm = Number(b);
  if (shankHeightMm <= 0 || shankWidthMm <= 0) return fail('shank', 'El alto y el ancho del mango deben ser mayores que cero.');
  const lengthMm = LENGTH_MM[len];
  if (lengthMm === undefined) return fail('length', `Letra de largo desconocida o especial: «${len}».`);
  return { ok: true, value: {
    code: `${clamp}${shape}${style}${clearance}${hand} ${h}${b}${len}${size}`, clampingLetter: clamp, clamping: CLAMPING[clamp], shape,
    styleLetter: style, kappaRDeg: STYLES[style].kappaRDeg, feed: STYLES[style].feed,
    clearanceLetter: clearance, clearanceDeg: CLEARANCE_DEG[clearance], hand,
    shankHeightMm, shankWidthMm, lengthLetter: len, lengthMm, sizeCode: size, provenance: 'iso-nominal',
  } };
}

/** Dimensions ISO 5608 does not fix. Defaults are educational choices, not standard values. */
export type IsoAssemblyOptions = {
  id?: ToolId;
  /** Radial extent of the head from the tool corner to the start of the uniform shank. Default 2.5 × IC. */
  headLengthMm?: number;
  /** Axial distance from the tool corner to the far side face of the shank. Default 1.25 × shank width. */
  offsetFMm?: number;
};
export type IsoToolAssembly = Omit<ToolAssembly, 'provenance'> & {
  provenance: 'iso-nominal';
  insert: InsertDesignation; holder: HolderDesignation;
  kappaRDeg: number; noseRadiusMm: number; headLengthMm: number; offsetFMm: number;
  /** Which values are nominal ISO and which are educational defaults/overrides. */
  educationalParameters: readonly ('headLengthMm' | 'offsetFMm')[];
};

/** Validates insert/holder compatibility (shape, clearance letter, cutting-edge size code). */
export function checkCompatibility(insert: InsertDesignation, holder: HolderDesignation): IsoError | null {
  if (insert.shape !== holder.shape) return { code: 'shape-mismatch', message: `El porta ${holder.code} es para insertos de forma ${holder.shape}, pero el inserto ${insert.code} es de forma ${insert.shape}.` };
  if (insert.clearanceLetter !== holder.clearanceLetter) return { code: 'clearance-mismatch', message: `El porta espera incidencia «${holder.clearanceLetter}» (${holder.clearanceDeg}°) y el inserto tiene «${insert.clearanceLetter}» (${insert.clearanceDeg}°).` };
  if (insert.sizeCode !== holder.sizeCode) return { code: 'size-mismatch', message: `El tamaño de filo del porta (${holder.sizeCode}) no coincide con el del inserto (${insert.sizeCode}).` };
  return null;
}

/** Equilateral insert polygon, CCW, starting at the ideal corner (origin) along `firstHeadingDeg`. */
function insertPolygon(shape: string, edge: number, firstHeadingDeg: number): ToolPoint[] {
  const angles = vertexAngles(shape);
  const points: ToolPoint[] = [[0, 0]];
  let heading = firstHeadingDeg;
  for (let i = 1; i < angles.length; i++) {
    const [z, r] = points[i - 1];
    points.push([z + edge * Math.cos(heading * DEG), r + edge * Math.sin(heading * DEG)]);
    heading += 180 - angles[i];
  }
  return points;
}

function convexHull(points: readonly ToolPoint[]): ToolPoint[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: ToolPoint, a: ToolPoint, b: ToolPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: ToolPoint[]) => {
    const out: ToolPoint[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 1e-12) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * External right-hand turning assembly from nominal ISO data. Feed is −Z; the major cutting edge
 * leaves the corner at 180° − κr from +Z and the minor edge at 180° − κr − ε, so the insert lies in
 * that wedge and the end cutting edge angle κr' = 180° − κr − ε must be positive.
 * Shank: height h along the tangential axis (top face at tangential 0, the corner height), width b
 * axial over Z ∈ [f − b, f], radial from the head length to the nominal length l1 measured from the corner.
 */
export function isoAssembly(insert: InsertDesignation, holder: HolderDesignation, options: IsoAssemblyOptions = {}): IsoResult<IsoToolAssembly> {
  const mismatch = checkCompatibility(insert, holder);
  if (mismatch) return { ok: false, error: mismatch };
  if (holder.hand !== 'R') return fail('hand', `Solo se generan portas exteriores de mano derecha (R); ${holder.code} es de mano ${holder.hand}.`);
  if (holder.feed === 'facing') return fail('style-facing', `El estilo ${holder.styleLetter} es de refrentado; el conjunto solo admite estilos de cilindrado.`);
  const kappa = holder.kappaRDeg; const eps = insert.pointAngleDeg;
  if (kappa + eps >= 180) return fail('geometry', `κr ${kappa}° + punta ${eps}° deja sin ángulo de filo secundario; combinación no admitida.`);
  const b = holder.shankWidthMm; const h = holder.shankHeightMm;
  const headLengthMm = options.headLengthMm ?? 2.5 * insert.icMm;
  const offsetFMm = options.offsetFMm ?? 1.25 * b;
  if (!(Number.isFinite(headLengthMm) && headLengthMm > 0 && headLengthMm < holder.lengthMm)) return fail('head-length', 'La longitud de cabeza debe ser positiva y menor que el largo del porta.');
  if (h <= insert.thicknessMm) return fail('shank', 'El alto del mango debe superar el espesor del inserto.');
  if (!(Number.isFinite(offsetFMm) && offsetFMm > 0)) return fail('offset', 'El offset f debe ser un número positivo.');
  const edge = insert.edgeLengthMm;
  const outline = insertPolygon(insert.shape, edge, 180 - kappa - eps);
  // Head (seat) under the insert: hull of the insert except a setback around the cutting corner, plus the shank front.
  const setback = Math.min(2, edge / 4);
  const along = (deg: number): ToolPoint => [setback * Math.cos(deg * DEG), setback * Math.sin(deg * DEG)];
  const shankFront: ToolPoint[] = [[offsetFMm - b, headLengthMm], [offsetFMm, headLengthMm]];
  const head = convexHull([...outline.slice(1), along(180 - kappa), along(180 - kappa - eps), ...shankFront]);
  const parts: ToolPart[] = [
    { kind: 'prism', role: 'holder', thicknessMm: h, tangentialCenterMm: -h / 2,
      outline: [[offsetFMm - b, headLengthMm], [offsetFMm, headLengthMm], [offsetFMm, holder.lengthMm], [offsetFMm - b, holder.lengthMm]] },
    { kind: 'prism', role: 'holder', outline: head, thicknessMm: h - insert.thicknessMm, tangentialCenterMm: -(h + insert.thicknessMm) / 2 },
    { kind: 'prism', role: 'insert', outline, thicknessMm: insert.thicknessMm, tangentialCenterMm: -insert.thicknessMm / 2 },
  ];
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  return { ok: true, value: {
    id: options.id ?? 'generic-od', provenance: 'iso-nominal', revision: 1,
    dimensions: `Nominal ISO, no datos de fabricante · ${holder.code} + ${insert.code} · mango ${h} × ${b} mm, largo ${holder.lengthMm} mm · κr ${fmt(kappa)}° · punta ${eps}° · IC ${fmt(insert.icMm)} · e ${fmt(insert.thicknessMm)} · rε ${fmt(insert.noseRadiusMm)} · cabeza ${fmt(headLengthMm)} y f ${fmt(offsetFMm)} mm didácticos`,
    parts, insert, holder, kappaRDeg: kappa, noseRadiusMm: insert.noseRadiusMm, headLengthMm, offsetFMm,
    educationalParameters: ['headLengthMm', 'offsetFMm'],
  } };
}
