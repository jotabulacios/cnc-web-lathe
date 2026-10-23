//! Educational collision check (TOOL_HOLDER_COLLISION, JAW_COLLISION warnings).
//!
//! Plane Z/R of the 2D view (Z to the right, physical radius up). Each catalogue
//! tool has the nominal silhouette that the views draw (TS `TOOL_ASSEMBLIES`),
//! relative to the tip. Every interpreted motion is sampled: the silhouette is
//! translated to each sample of the tip path and compared with
//! - the exterior material remaining at that instant (the profile before the
//!   motion, minus what the tip has already swept in this motion), and
//! - a nominal jaw zone gripping the raw stock from the chuck end.
//!
//! On feed moves the insert region holding the cutting edges (the "cutting zone")
//! may touch material; holder, clamp and the back of the insert may not. On a
//! rapid nothing may touch material; the tip itself entering material is already
//! RAPID_IN_STOCK, where the exterior model freezes and this check stops.
//!
//! Nominal teaching geometry, a 2D silhouette of a 3D tool and sampled motion:
//! it never certifies that a program is safe on a real machine.
use serde::Serialize;

use crate::lab_profile::needs_annular_model;
use crate::linear_profile::{GeometryBudget, LinearProfile, LinearProfileSpan};
use crate::profile_v2::step_motion;
use crate::{
    Block, ChuckJaws, CompileResult, Diagnostic, MAX_MAGNITUDE, Motion, MotionKind, Position,
    Setup, Severity, Stock,
};

/// Jaw defaults when the setup has no `jaws` field (older setups and projects).
pub const DEFAULT_JAW_GRIP_MM: f64 = 15.0;
pub const DEFAULT_JAW_HEIGHT_MM: f64 = 12.0;
/// Tip travel between samples. An overlap that starts and ends between two
/// samples is missed only if it stays shallower than about half a step.
pub const COLLISION_STEP_MM: f64 = 0.25;
/// Penetration ignored as contact (also the width of the boundary band skipped
/// next to each breakpoint). Numerical/educational slack, not a clearance.
pub const COLLISION_TOLERANCE_MM: f64 = 0.05;
/// Longer motions use a coarser step: length / MAX_SAMPLES_PER_MOTION.
pub const MAX_SAMPLES_PER_MOTION: usize = 4000;
/// Work units (samples × spans/vertices visited) for one program; beyond it the
/// check stops with COLLISION_CHECK_LIMIT instead of going silent.
pub const MAX_COLLISION_WORK: usize = 40_000_000;

type Pt = [f64; 2];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PartRole {
    Insert,
    Holder,
    Clamp,
}

impl PartRole {
    fn name(self) -> &'static str {
        match self {
            Self::Insert => "el inserto",
            Self::Holder => "el mango",
            Self::Clamp => "la abrazadera",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SilhouettePart {
    pub role: PartRole,
    /// Closed outline `[z, r]` in mm relative to the tip.
    pub outline: Vec<Pt>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSilhouette {
    pub tool_id: &'static str,
    /// Station and short name for messages.
    pub label: &'static str,
    /// Display outlines, same order and points as TS `partOutline` of `TOOL_ASSEMBLIES`.
    pub parts: Vec<SilhouettePart>,
    /// Insert region with the cutting edges, allowed to touch material on feeds.
    pub cutting_zone: Vec<Pt>,
    /// Regions that must not touch material on feeds (holder, clamp, insert back).
    pub checked: Vec<SilhouettePart>,
    /// false = ideal tool: no holder check (T0 is a point; T5 needs the annular model).
    pub holder_check: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollisionModel {
    pub tools: Vec<ToolSilhouette>,
    pub default_jaws: ChuckJaws,
    pub step_mm: f64,
    pub tolerance_mm: f64,
}

fn rectangle(z0: f64, r0: f64, z1: f64, r1: f64) -> Vec<Pt> {
    vec![[z0, r0], [z1, r0], [z1, r1], [z0, r1]]
}

/// Same construction as TS `rhombus`: tip, minor-edge end, far corner, major-edge end.
fn rhombus(edge: f64, angle: f64, mirrored: bool) -> Vec<Pt> {
    let a = (90.0 - angle) * std::f64::consts::PI / 180.0;
    let z = edge * a.cos();
    let r = edge * a.sin();
    let sign = if mirrored { -1.0 } else { 1.0 };
    vec![
        [0.0, 0.0],
        [z, sign * r],
        [z, sign * (r + edge)],
        [0.0, sign * edge],
    ]
}

fn shank(length: f64) -> Vec<Pt> {
    vec![
        [3.0, 5.0],
        [12.0, 5.0],
        [14.0, 14.0],
        [14.0, 5.0 + length],
        [2.0, 5.0 + length],
        [2.0, 14.0],
    ]
}

fn part(role: PartRole, outline: Vec<Pt>) -> SilhouettePart {
    SilhouettePart { role, outline }
}

/// Rhombic insert on a shank: the triangle tip–edge ends holds both cutting
/// edges; the opposite triangle (the far corner) is the insert back.
fn rhombic_tool(
    tool_id: &'static str,
    label: &'static str,
    shank_length: f64,
    edge: f64,
    angle: f64,
    holder_check: bool,
) -> ToolSilhouette {
    let insert = rhombus(edge, angle, false);
    let holder = shank(shank_length);
    ToolSilhouette {
        tool_id,
        label,
        cutting_zone: vec![insert[0], insert[1], insert[3]],
        checked: vec![
            part(PartRole::Holder, holder.clone()),
            part(PartRole::Insert, vec![insert[1], insert[2], insert[3]]),
        ],
        parts: vec![
            part(PartRole::Holder, holder),
            part(PartRole::Insert, insert),
        ],
        holder_check,
    }
}

/// Nominal silhouettes of the six catalogue tools (src/lib/lathe/toolAssemblies.ts).
pub fn tool_silhouettes() -> Vec<ToolSilhouette> {
    let facing_insert = {
        let a = std::f64::consts::PI / 36.0;
        vec![
            [0.0, 0.0],
            [10.0 * a.cos(), 10.0 * a.sin()],
            [10.0 * a.sin(), 10.0 * a.cos()],
        ]
    };
    let facing_holder = vec![
        [3.0, 4.0],
        [10.0, 3.0],
        [65.0, 3.0],
        [65.0, 15.0],
        [12.0, 15.0],
        [3.0, 10.0],
    ];
    let boring_insert = rhombus(4.0, 55.0, true);
    vec![
        // Ideal point: drawn with a holder, but no clearance restrictions.
        {
            let mut tool = rhombic_tool("generic-od", "T0 (neutra)", 50.0, 6.0, 80.0, false);
            tool.checked.clear();
            tool
        },
        rhombic_tool("roughing-od", "T0101 (desbaste 80°)", 60.0, 8.0, 80.0, true),
        rhombic_tool("finishing-od", "T0202 (acabado 55°)", 55.0, 6.0, 55.0, true),
        ToolSilhouette {
            tool_id: "grooving-od",
            label: "T0303 (ranurado)",
            parts: vec![
                part(PartRole::Holder, rectangle(0.0, 6.0, 3.0, 51.0)),
                part(PartRole::Clamp, rectangle(-3.5, 32.0, 6.5, 65.0)),
                part(PartRole::Insert, rectangle(0.0, 0.0, 3.0, 12.0)),
            ],
            // The whole 12 mm insert may be inside a cut; the blade is checked
            // only above it so the overlapping display parts do not self-report.
            cutting_zone: rectangle(0.0, 0.0, 3.0, 12.0),
            checked: vec![
                part(PartRole::Holder, rectangle(0.0, 12.0, 3.0, 51.0)),
                part(PartRole::Clamp, rectangle(-3.5, 32.0, 6.5, 65.0)),
            ],
            holder_check: true,
        },
        ToolSilhouette {
            tool_id: "facing-od",
            label: "T0404 (refrentado 80°)",
            parts: vec![
                part(PartRole::Holder, facing_holder.clone()),
                part(PartRole::Insert, facing_insert.clone()),
            ],
            // Both edges of the 80° triangle run from the tip: all of it cuts.
            cutting_zone: facing_insert,
            checked: vec![part(PartRole::Holder, facing_holder)],
            holder_check: true,
        },
        ToolSilhouette {
            tool_id: "boring-id",
            label: "T0505 (mandrinado)",
            parts: vec![
                part(PartRole::Holder, rectangle(4.0, -10.0, 64.0, -2.0)),
                part(
                    PartRole::Holder,
                    vec![
                        [0.0, -4.0],
                        [4.0, -10.0],
                        [12.0, -10.0],
                        [12.0, -2.0],
                        [4.0, -2.0],
                    ],
                ),
                part(PartRole::Insert, boring_insert.clone()),
            ],
            cutting_zone: boring_insert,
            checked: Vec::new(),
            holder_check: false,
        },
    ]
}

pub fn collision_model() -> CollisionModel {
    CollisionModel {
        tools: tool_silhouettes(),
        default_jaws: default_jaws(),
        step_mm: COLLISION_STEP_MM,
        tolerance_mm: COLLISION_TOLERANCE_MM,
    }
}

pub fn default_jaws() -> ChuckJaws {
    ChuckJaws {
        grip_length_mm: DEFAULT_JAW_GRIP_MM,
        jaw_height_mm: DEFAULT_JAW_HEIGHT_MM,
    }
}

/// Setup validation message, or None. Grip 0 keeps only the chuck face.
pub(crate) fn jaws_error(jaws: &ChuckJaws, stock: &Stock) -> Option<&'static str> {
    let finite = [jaws.grip_length_mm, jaws.jaw_height_mm]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= MAX_MAGNITUDE);
    if !finite || jaws.grip_length_mm < 0.0 || jaws.jaw_height_mm <= 0.0 {
        return Some("Mordazas fuera de rango: largo tomado ≥ 0 y altura > 0 mm.");
    }
    if jaws.grip_length_mm >= stock.length_mm {
        return Some("Las mordazas no pueden tomar todo el largo de la pieza.");
    }
    None
}

/// Effective jaws: the setup's, or the defaults limited to half a short stock.
pub fn resolved_jaws(setup: &Setup) -> ChuckJaws {
    setup.jaws.unwrap_or_else(|| ChuckJaws {
        grip_length_mm: DEFAULT_JAW_GRIP_MM.min(setup.stock.length_mm / 2.0),
        jaw_height_mm: DEFAULT_JAW_HEIGHT_MM,
    })
}

fn translated(outline: &[Pt], tip: Position) -> Vec<Pt> {
    outline
        .iter()
        .map(|[z, r]| [tip.z_mm + z, tip.r_mm + r])
        .collect()
}

/// Lowest radius of the polygon on the vertical line `z`, if it crosses it.
fn lower_r(poly: &[Pt], z: f64) -> Option<f64> {
    let mut lowest: Option<f64> = None;
    for (i, a) in poly.iter().enumerate() {
        let b = poly[(i + 1) % poly.len()];
        let (lo, hi) = (a[0].min(b[0]), a[0].max(b[0]));
        if z < lo || z > hi {
            continue;
        }
        let r = if a[0] == b[0] {
            a[1].min(b[1])
        } else {
            a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0])
        };
        lowest = Some(lowest.map_or(r, |l| l.min(r)));
    }
    lowest
}

fn radius_at(spans: &[LinearProfileSpan], z: f64) -> Option<f64> {
    let first = spans.first()?;
    let last = spans.last()?;
    if z < first.z_start_mm || z > last.z_end_mm {
        return None;
    }
    let index = spans
        .partition_point(|s| s.z_end_mm <= z)
        .min(spans.len() - 1);
    Some(spans[index].radius(z))
}

#[derive(Clone, Copy, Debug)]
struct Contact {
    depth: f64,
    /// Contact point (Z, physical radius).
    point: Position,
}

/// Deepest vertical penetration of a polygon into the exterior material. Both
/// boundaries are piecewise linear, so the maximum of `f(z) − lower(z)` on each
/// interval between breakpoints lies at its ends; breakpoints are evaluated at
/// ±tolerance so contacts on a face or a shoulder are not penetration.
fn material_contact(poly: &[Pt], spans: &[LinearProfileSpan], work: &mut usize) -> Option<Contact> {
    let tol = COLLISION_TOLERANCE_MM;
    let zmin = poly.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
    let zmax = poly.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
    let lo = zmin.max(spans.first()?.z_start_mm);
    let hi = zmax.min(spans.last()?.z_end_mm);
    if hi - lo <= 2.0 * tol {
        return None;
    }
    let first = spans.partition_point(|s| s.z_end_mm <= lo);
    let last = spans.partition_point(|s| s.z_start_mm < hi);
    let mut candidates: Vec<f64> = poly.iter().map(|p| p[0]).collect();
    candidates.extend([lo, hi]);
    candidates.extend(spans[first..last].iter().map(|s| s.z_start_mm));
    *work += candidates.len() * (poly.len() + 1);
    let mut best: Option<Contact> = None;
    for c in candidates {
        for z in [c - tol, c + tol] {
            if z < lo + tol - 1e-12 || z > hi - tol + 1e-12 {
                continue;
            }
            let (Some(lower), Some(surface)) = (lower_r(poly, z), radius_at(spans, z)) else {
                continue;
            };
            let depth = surface - lower;
            if best.is_none_or(|b| depth > b.depth) {
                best = Some(Contact {
                    depth,
                    point: Position {
                        r_mm: surface,
                        z_mm: z,
                    },
                });
            }
        }
    }
    best.filter(|b| b.depth > tol)
}

/// Deepest point of a polygon inside the quadrant `z < zj, r < rj`:
/// max of min(zj − z, rj − r), at a vertex or where an edge crosses the diagonal.
fn jaw_contact(poly: &[Pt], zj: f64, rj: f64) -> Option<Contact> {
    let depth = |p: Pt| (zj - p[0]).min(rj - p[1]);
    let mut best: Option<Contact> = None;
    let mut consider = |p: Pt| {
        let d = depth(p);
        if best.is_none_or(|b| d > b.depth) {
            best = Some(Contact {
                depth: d,
                point: Position {
                    r_mm: p[1],
                    z_mm: p[0],
                },
            });
        }
    };
    for (i, &a) in poly.iter().enumerate() {
        consider(a);
        let b = poly[(i + 1) % poly.len()];
        // g(p) = (zj − z) − (rj − r) changes sign along the edge.
        let (ga, gb) = (zj - a[0] - (rj - a[1]), zj - b[0] - (rj - b[1]));
        if ga * gb < 0.0 {
            let t = ga / (ga - gb);
            consider([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    }
    best.filter(|b| b.depth > COLLISION_TOLERANCE_MM)
}

fn point_at(motion: &Motion, t: f64) -> Position {
    if t >= 1.0 {
        return motion.to;
    }
    match motion.arc {
        Some(arc) => {
            let sigma = if arc.clockwise { -1.0 } else { 1.0 };
            let theta0 =
                (motion.from.r_mm - arc.center.r_mm).atan2(motion.from.z_mm - arc.center.z_mm);
            let theta = theta0 + sigma * t * arc.sweep_rad;
            Position {
                r_mm: arc.center.r_mm + arc.radius_mm * theta.sin(),
                z_mm: arc.center.z_mm + arc.radius_mm * theta.cos(),
            }
        }
        None => Position {
            r_mm: motion.from.r_mm + (motion.to.r_mm - motion.from.r_mm) * t,
            z_mm: motion.from.z_mm + (motion.to.z_mm - motion.from.z_mm) * t,
        },
    }
}

fn sample_count(motion: &Motion) -> usize {
    let n = (motion.length_mm / COLLISION_STEP_MM).ceil();
    if n.is_finite() && n >= 1.0 {
        (n as usize).min(MAX_SAMPLES_PER_MOTION)
    } else {
        1
    }
}

/// Bounding box `[zmin, zmax, rmin, rmax]` of the tip path (whole circle for arcs).
fn path_box(motion: &Motion) -> [f64; 4] {
    let (a, b) = (motion.from, motion.to);
    let mut bbox = [
        a.z_mm.min(b.z_mm),
        a.z_mm.max(b.z_mm),
        a.r_mm.min(b.r_mm),
        a.r_mm.max(b.r_mm),
    ];
    if let Some(arc) = motion.arc {
        bbox = [
            bbox[0].min(arc.center.z_mm - arc.radius_mm),
            bbox[1].max(arc.center.z_mm + arc.radius_mm),
            bbox[2].min(arc.center.r_mm - arc.radius_mm),
            bbox[3].max(arc.center.r_mm + arc.radius_mm),
        ];
    }
    bbox
}

fn outline_box(parts: &[&[Pt]]) -> [f64; 4] {
    let mut bbox = [
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
    ];
    for p in parts.iter().flat_map(|o| o.iter()) {
        bbox = [
            bbox[0].min(p[0]),
            bbox[1].max(p[0]),
            bbox[2].min(p[1]),
            bbox[3].max(p[1]),
        ];
    }
    bbox
}

/// Swept bounding box of the outlines along the path.
fn swept_box(motion: &Motion, parts: &[&[Pt]]) -> [f64; 4] {
    let p = path_box(motion);
    let o = outline_box(parts);
    [p[0] + o[0], p[1] + o[1], p[2] + o[2], p[3] + o[3]]
}

/// The exterior (solid) model applies: no tube interior tool. Compile does not
/// know the initial bore, so a tube is checked against its outer profile and
/// the walk stops where the solid model cannot follow (e.g. tubular facing).
fn exterior_model_applies(result: &CompileResult, setup: &Setup) -> bool {
    !needs_annular_model(result, &setup.tool_id, 0.0)
}

/// Walk the exterior model motion by motion exactly as `profile_at_v2` does.
/// `visit(block, motion, material_before, cuts)` returns false to stop. The
/// walk ends silently where the profile freezes: the profile reports it there.
fn walk_exterior(
    result: &CompileResult,
    setup: &Setup,
    mut visit: impl FnMut(&Block, &Motion, &LinearProfile, bool) -> bool,
) {
    let stock = &setup.stock;
    if !result.executable || !exterior_model_applies(result, setup) {
        return;
    }
    let mut budget = GeometryBudget::default();
    let Ok(mut geometry) = LinearProfile::new(
        vec![LinearProfileSpan {
            z_start_mm: -stock.length_mm,
            z_end_mm: 0.0,
            r_start_mm: stock.diameter_mm / 2.0,
            r_end_mm: stock.diameter_mm / 2.0,
        }],
        &mut budget,
    ) else {
        return;
    };
    let initial = result.initial_state.position;
    if -stock.length_mm < initial.z_mm
        && initial.z_mm < 0.0
        && initial.r_mm < stock.diameter_mm / 2.0
    {
        return;
    }
    for (index, block) in result.blocks.iter().enumerate() {
        let mut candidate: Option<LinearProfile> = None;
        if budget.charge().is_err() {
            return;
        }
        for id in &block.motion_ids {
            let Some(motion) = result.motions.get(*id).filter(|m| m.block_id == index) else {
                return;
            };
            let base = candidate.as_ref().unwrap_or(&geometry);
            let Ok(next) = step_motion(base, motion, block, stock, &mut budget) else {
                return;
            };
            if !visit(block, motion, base, next.is_some()) {
                return;
            }
            if let Some(next) = next {
                candidate = Some(next);
            }
        }
        if let Some(next) = candidate {
            geometry = next;
        }
    }
}

/// Per motion id: Some(true) if the exterior model removes material with it,
/// Some(false) if it stays in air, None where the model does not reach.
pub(crate) fn exterior_engagement(result: &CompileResult, setup: &Setup) -> Vec<Option<bool>> {
    let mut engaged = vec![None; result.motions.len()];
    // Only tools with a working-angle envelope consume the verdict.
    if !result
        .motions
        .iter()
        .any(|m| crate::working_angle::envelope(&m.tool_id).is_some())
    {
        return engaged;
    }
    walk_exterior(result, setup, |_, motion, _, cuts| {
        if let Some(slot) = engaged.get_mut(motion.id) {
            *slot = Some(cuts);
        }
        true
    });
    engaged
}

fn is_facing(motion: &Motion, stock: &Stock) -> bool {
    motion.kind == MotionKind::Linear
        && motion.from.z_mm == motion.to.z_mm
        && motion.from.r_mm > motion.to.r_mm
        && motion.to.r_mm == 0.0
        && motion.to.z_mm > -stock.length_mm
        && motion.to.z_mm < 0.0
}

/// Material in front of the silhouette at fraction `t` of a cutting motion: the
/// profile before the motion minus the part the tip has already swept. None when
/// the model cannot represent the partial cut (the sample is then skipped).
fn material_at(
    base: &LinearProfile,
    motion: &Motion,
    block: &Block,
    stock: &Stock,
    t: f64,
) -> Option<LinearProfile> {
    if t <= 0.0 {
        return Some(base.clone());
    }
    let mut budget = GeometryBudget::default();
    let tip = point_at(motion, t);
    if is_facing(motion, stock) {
        // Facing removes everything in front of the tip down to its radius.
        return base
            .cut(
                &LinearProfileSpan {
                    z_start_mm: tip.z_mm,
                    z_end_mm: 0.0,
                    r_start_mm: tip.r_mm,
                    r_end_mm: tip.r_mm,
                },
                &mut budget,
            )
            .ok();
    }
    let mut partial = motion.clone();
    partial.to = tip;
    if let Some(arc) = partial.arc.as_mut() {
        arc.sweep_rad *= t;
    }
    match step_motion(base, &partial, block, stock, &mut budget) {
        Ok(Some(next)) => Some(next),
        Ok(None) => Some(base.clone()),
        Err(_) => None,
    }
}

struct Hit {
    /// Parts in contact somewhere along the motion, holder first.
    roles: Vec<PartRole>,
    /// Deepest contact over the motion and its sample tip.
    contact: Contact,
    tip: Position,
    rapid: bool,
}

enum Outcome {
    Clear,
    Hit(Hit),
    Limit,
}

fn holder_hit(
    tool: &ToolSilhouette,
    motion: &Motion,
    block: &Block,
    base: &LinearProfile,
    cuts: bool,
    stock: &Stock,
    work: &mut usize,
) -> Outcome {
    let mut regions: Vec<(PartRole, &[Pt])> = tool
        .checked
        .iter()
        .map(|p| (p.role, p.outline.as_slice()))
        .collect();
    if motion.kind == MotionKind::Rapid {
        regions.push((PartRole::Insert, tool.cutting_zone.as_slice()));
    }
    let outlines: Vec<&[Pt]> = regions.iter().map(|(_, o)| *o).collect();
    let swept = swept_box(motion, &outlines);
    let spans = base.spans();
    let max_r = spans
        .iter()
        .map(|s| s.r_start_mm.max(s.r_end_mm))
        .fold(0.0, f64::max);
    let (z0, z1) = (spans[0].z_start_mm, spans[spans.len() - 1].z_end_mm);
    if swept[1] <= z0 || swept[0] >= z1 || swept[2] >= max_r {
        return Outcome::Clear;
    }
    let rapid = motion.kind == MotionKind::Rapid;
    sweep(motion, work, spans.len() + 1, rapid, |t, tip, work| {
        let material = if cuts {
            material_at(base, motion, block, stock, t)?
        } else {
            base.clone()
        };
        Some(
            regions
                .iter()
                .filter_map(|(role, outline)| {
                    material_contact(&translated(outline, tip), material.spans(), work)
                        .map(|contact| (*role, contact))
                })
                .collect(),
        )
    })
}

/// Samples the tip path. A motion that already starts in contact is skipped:
/// the block where the tool entered was reported. Otherwise the deepest contact
/// over the samples t ∈ (0, 1] is returned. `contact_at` returns None to skip a
/// sample the model cannot evaluate.
fn sweep(
    motion: &Motion,
    work: &mut usize,
    cost: usize,
    rapid: bool,
    mut contact_at: impl FnMut(f64, Position, &mut usize) -> Option<Vec<(PartRole, Contact)>>,
) -> Outcome {
    let n = sample_count(motion);
    let mut deepest: Option<Hit> = None;
    let mut roles: Vec<PartRole> = Vec::new();
    for i in 0..=n {
        let t = i as f64 / n as f64;
        *work += cost;
        if *work > MAX_COLLISION_WORK {
            return Outcome::Limit;
        }
        let tip = point_at(motion, t);
        let Some(found) = contact_at(t, tip, work) else {
            continue;
        };
        if i == 0 && !found.is_empty() {
            return Outcome::Clear;
        }
        for (role, contact) in found {
            if !roles.contains(&role) {
                roles.push(role);
            }
            if deepest
                .as_ref()
                .is_none_or(|d| contact.depth > d.contact.depth)
            {
                deepest = Some(Hit {
                    roles: Vec::new(),
                    contact,
                    tip,
                    rapid,
                });
            }
        }
    }
    roles.sort_by_key(|r| match r {
        PartRole::Holder => 0,
        PartRole::Clamp => 1,
        PartRole::Insert => 2,
    });
    deepest.map_or(Outcome::Clear, |hit| Outcome::Hit(Hit { roles, ..hit }))
}

/// Outlines entering the jaw zone: the whole drawn tool, or the tip of T0.
fn jaw_outlines(tool: &ToolSilhouette) -> Vec<(PartRole, Vec<Pt>)> {
    if tool.tool_id == "boring-id" {
        Vec::new()
    } else if !tool.holder_check {
        vec![(PartRole::Insert, vec![[0.0, 0.0]])]
    } else {
        tool.parts
            .iter()
            .map(|p| (p.role, p.outline.clone()))
            .collect()
    }
}

fn jaw_hit(tool: &ToolSilhouette, motion: &Motion, zj: f64, rj: f64, work: &mut usize) -> Outcome {
    let regions = jaw_outlines(tool);
    if regions.is_empty() {
        return Outcome::Clear;
    }
    let outlines: Vec<&[Pt]> = regions.iter().map(|(_, o)| o.as_slice()).collect();
    let swept = swept_box(motion, &outlines);
    if swept[0] >= zj - COLLISION_TOLERANCE_MM || swept[2] >= rj - COLLISION_TOLERANCE_MM {
        return Outcome::Clear;
    }
    let rapid = motion.kind == MotionKind::Rapid;
    sweep(motion, work, regions.len() * 8, rapid, |_, tip, _| {
        Some(
            regions
                .iter()
                .filter_map(|(role, outline)| {
                    jaw_contact(&translated(outline, tip), zj, rj).map(|contact| (*role, contact))
                })
                .collect(),
        )
    })
}

fn fmt_mm(value: f64) -> String {
    let text = format!("{value:.2}");
    let text = text.trim_end_matches('0').trim_end_matches('.');
    let text = if text == "-0" { "0" } else { text };
    text.replace('-', "−").replace('.', ",")
}

fn at(p: Position) -> String {
    format!("Z{} X{}", fmt_mm(p.z_mm), fmt_mm(2.0 * p.r_mm))
}

const DISCLAIMER: &str = "Aviso educativo con geometría nominal en 2D: no garantiza que el programa sea seguro en una máquina real.";

/// "el mango", "el mango y el inserto", "el mango, la abrazadera y el inserto".
fn parts_text(roles: &[PartRole]) -> String {
    let names: Vec<&str> = roles.iter().map(|r| r.name()).collect();
    match names.split_last() {
        Some((last, [])) => (*last).into(),
        Some((last, rest)) => format!("{} y {last}", rest.join(", ")),
        None => "la herramienta".into(),
    }
}

fn holder_message(tool: &ToolSilhouette, hit: &Hit) -> String {
    let part = parts_text(&hit.roles);
    let verb = if hit.roles.len() > 1 { "tocan" } else { "toca" };
    let fix = if hit.rapid {
        "En rápido ninguna parte de la herramienta debe tocar la pieza: retirá primero en X, acercate en el aire o usá G01 para cortar."
    } else if hit.roles == [PartRole::Insert] {
        "Solo los filos cercanos a la punta cortan: suavizá la pendiente, cambiá el sentido del avance o usá un inserto más agudo."
    } else {
        "Cambiá el orden o el sentido de las pasadas, dejá ese tramo para otra herramienta o usá un porta con otro ángulo de posición."
    };
    format!(
        "Colisión con {}: {part} {verb} el material que queda; lo más profundo, en {} (entra {} mm) con la punta en {}. {fix} {DISCLAIMER}",
        tool.label,
        at(hit.contact.point),
        fmt_mm(hit.contact.depth),
        at(hit.tip),
    )
}

fn jaw_message(tool: &ToolSilhouette, hit: &Hit, jaws: &ChuckJaws, stock: &Stock) -> String {
    let face = -stock.length_mm + jaws.grip_length_mm;
    format!(
        "Mordazas: {part} de {label} {verb} en la zona de las mordazas; lo más adentro, en {point}, con la punta en {tip}. Las mordazas nominales toman la pieza desde Z{chuck} hasta Z{face} y llegan a X{outer}. Mantené la herramienta en Z mayor que {face_value}, retirá en X antes de acercarte al plato o sujetá menos largo en la configuración. {DISCLAIMER}",
        part = if tool.holder_check {
            parts_text(&hit.roles)
        } else {
            "la punta".into()
        },
        verb = if hit.roles.len() > 1 {
            "entran"
        } else {
            "entra"
        },
        label = tool.label,
        point = at(hit.contact.point),
        tip = at(hit.tip),
        chuck = fmt_mm(-stock.length_mm),
        face = fmt_mm(face),
        outer = fmt_mm(stock.diameter_mm + 2.0 * jaws.jaw_height_mm),
        face_value = fmt_mm(face),
    )
}

fn warning(code: &str, motion: &Motion, message: String, point: Option<Position>) -> Diagnostic {
    Diagnostic {
        code: code.into(),
        severity: Severity::Warning,
        span: motion.span,
        message,
        point,
    }
}

/// One TOOL_HOLDER_COLLISION and one JAW_COLLISION at most per block, in block
/// order. `result` holds the final motions (after offsets and nose contact path),
/// the same ones the material reconstruction consumes.
pub(crate) fn check(result: &CompileResult, setup: &Setup) -> Vec<Diagnostic> {
    if !result.executable {
        return Vec::new();
    }
    let stock = &setup.stock;
    let jaws = resolved_jaws(setup);
    let silhouettes = tool_silhouettes();
    let find = |id: &str| silhouettes.iter().find(|t| t.tool_id == id);
    let mut work = 0usize;
    let mut limit: Option<(usize, Diagnostic)> = None;
    let mut holder: Vec<Option<Diagnostic>> = vec![None; result.blocks.len()];
    let any_holder = result
        .motions
        .iter()
        .any(|m| find(&m.tool_id).is_some_and(|t| t.holder_check));
    if any_holder {
        walk_exterior(result, setup, |block, motion, base, cuts| {
            if holder[block.id].is_some() {
                return true;
            }
            let Some(tool) = find(&motion.tool_id).filter(|t| t.holder_check) else {
                return true;
            };
            match holder_hit(tool, motion, block, base, cuts, stock, &mut work) {
                Outcome::Clear => true,
                Outcome::Hit(hit) => {
                    holder[block.id] = Some(warning(
                        "TOOL_HOLDER_COLLISION",
                        motion,
                        holder_message(tool, &hit),
                        Some(hit.contact.point),
                    ));
                    true
                }
                Outcome::Limit => {
                    limit = Some((motion.block_id, limit_warning(motion)));
                    false
                }
            }
        });
    }
    let zj = -stock.length_mm + jaws.grip_length_mm;
    let rj = stock.diameter_mm / 2.0 + jaws.jaw_height_mm;
    let mut jaw: Vec<Option<Diagnostic>> = vec![None; result.blocks.len()];
    // Jaws are checked up to the block where the budget ran out, if it did.
    let end = limit.as_ref().map_or(usize::MAX, |(block, _)| *block);
    for motion in &result.motions {
        if motion.block_id >= end {
            break;
        }
        if jaw.get(motion.block_id).is_none_or(|d| d.is_some()) {
            continue;
        }
        let Some(tool) = find(&motion.tool_id) else {
            continue;
        };
        match jaw_hit(tool, motion, zj, rj, &mut work) {
            Outcome::Clear => {}
            Outcome::Hit(hit) => {
                jaw[motion.block_id] = Some(warning(
                    "JAW_COLLISION",
                    motion,
                    jaw_message(tool, &hit, &jaws, stock),
                    Some(hit.contact.point),
                ));
            }
            Outcome::Limit => {
                limit = Some((motion.block_id, limit_warning(motion)));
                break;
            }
        }
    }
    let mut diagnostics: Vec<Diagnostic> = holder
        .into_iter()
        .zip(jaw)
        .flat_map(|(h, j)| [h, j])
        .flatten()
        .collect();
    diagnostics.extend(limit.map(|(_, d)| d));
    diagnostics
}

fn limit_warning(motion: &Motion) -> Diagnostic {
    warning(
        "COLLISION_CHECK_LIMIT",
        motion,
        "El control educativo de colisiones alcanzó su límite de cálculo y no revisó desde este bloque en adelante.".into(),
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(r: f64) -> Vec<LinearProfileSpan> {
        vec![LinearProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            r_start_mm: r,
            r_end_mm: r,
        }]
    }

    #[test]
    fn rhombus_matches_the_ts_construction() {
        let r = rhombus(8.0, 80.0, false);
        assert!((r[1][0] - 8.0 * 10f64.to_radians().cos()).abs() < 1e-12);
        assert!((r[2][1] - (8.0 * 10f64.to_radians().sin() + 8.0)).abs() < 1e-12);
        assert_eq!(r[3], [0.0, 8.0]);
    }

    #[test]
    fn contacts_on_faces_are_not_penetration() {
        let mut work = 0;
        // Square resting on the surface and against the front face.
        let on_top = rectangle(-10.0, 20.0, -5.0, 30.0);
        assert!(material_contact(&on_top, &flat(20.0), &mut work).is_none());
        let in_front = rectangle(0.0, 0.0, 5.0, 10.0);
        assert!(material_contact(&in_front, &flat(20.0), &mut work).is_none());
        let inside = rectangle(-10.0, 19.0, -5.0, 30.0);
        let contact = material_contact(&inside, &flat(20.0), &mut work).unwrap();
        assert!((contact.depth - 1.0).abs() < 1e-9);
        assert_eq!(contact.point.r_mm, 20.0);
    }

    #[test]
    fn shoulder_corner_inside_a_polygon_is_found() {
        // Step from R10 (z > −20) to R20 (z < −20); a box whose lower-left corner
        // sits above R10 but crosses the shoulder wall.
        let spans = vec![
            LinearProfileSpan {
                z_start_mm: -100.0,
                z_end_mm: -20.0,
                r_start_mm: 20.0,
                r_end_mm: 20.0,
            },
            LinearProfileSpan {
                z_start_mm: -20.0,
                z_end_mm: 0.0,
                r_start_mm: 10.0,
                r_end_mm: 10.0,
            },
        ];
        let mut work = 0;
        let crossing = rectangle(-21.0, 12.0, -15.0, 30.0);
        assert!(
            material_contact(&crossing, &spans, &mut work)
                .unwrap()
                .depth
                > 7.9
        );
        let touching = rectangle(-20.0, 12.0, -15.0, 30.0);
        assert!(material_contact(&touching, &spans, &mut work).is_none());
    }

    #[test]
    fn jaw_quadrant_depth() {
        assert!(jaw_contact(&rectangle(-80.0, 30.0, -70.0, 40.0), -85.0, 37.0).is_none());
        let hit = jaw_contact(&rectangle(-90.0, 30.0, -70.0, 40.0), -85.0, 37.0).unwrap();
        assert!((hit.depth - 5.0).abs() < 1e-9);
        assert!(jaw_contact(&[[-85.0, 10.0]], -85.0, 37.0).is_none());
        assert!(jaw_contact(&[[-86.0, 10.0]], -85.0, 37.0).is_some());
    }

    #[test]
    fn number_format_uses_comma_and_minus_sign() {
        assert_eq!(fmt_mm(-32.5), "−32,5");
        assert_eq!(fmt_mm(40.0), "40");
        assert_eq!(fmt_mm(-0.001), "0");
        assert_eq!(fmt_mm(0.126), "0,13");
    }
}
