//! Additive v2 reconstruction. The existing stock_profile WASM export still uses v1.
use crate::linear_profile::{
    GeometryBudget, GeometryError, LinearProfile, LinearProfileSpan, checked_difference,
};
use crate::{
    ArcGeometry, Block, CompileResult, Diagnostic, MAX_MAGNITUDE, Motion, MotionKind, Position,
    Severity, SourceSpan, Stock,
};
use serde::Serialize;

/// Maximum chord deviation allowed when flattening an arc into linear spans, in mm.
/// Educational bound, not a machining tolerance.
pub const ARC_CHORD_TOLERANCE_MM: f64 = 0.01;
/// Hard cap on segments per arc. Exceeding it freezes the block with PROFILE_LIMIT.
pub const MAX_ARC_SEGMENTS: usize = 512;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockProfileV2 {
    pub profile_version: u32,
    pub source_revision: u32,
    pub completed_blocks: usize,
    pub evaluated_blocks: usize,
    pub complete: bool,
    pub spans: Vec<LinearProfileSpan>,
    pub diagnostics: Vec<Diagnostic>,
}

pub(crate) enum ProfileError {
    Geometry(GeometryError),
    Invalid,
    Rapid,
    Spindle,
    Unsupported,
    Arc,
    Lead,
}
impl From<GeometryError> for ProfileError {
    fn from(error: GeometryError) -> Self {
        Self::Geometry(error)
    }
}
fn diagnostic(error: ProfileError, span: SourceSpan) -> Diagnostic {
    let (code, message) = match error {
        ProfileError::Rapid => (
            "RAPID_IN_STOCK",
            "Un rápido entra en material; el perfil se detiene antes de este bloque.",
        ),
        ProfileError::Lead => (
            "COMP_LEAD_IN_STOCK",
            "La entrada o salida de compensación (o un enlace de la punta redonda) atraviesa material. Hacela en el aire, antes de tocar la pieza.",
        ),
        ProfileError::Spindle => (
            "SPINDLE_OFF",
            "El avance entra en material sin husillo encendido y RPM positivas.",
        ),
        ProfileError::Unsupported => (
            "UNSUPPORTED_PROFILE_CUT",
            "El perfil lineal admite cortes exteriores G01 hacia Z negativo y refrentado hacia X0; no cortes radiales parciales ni avance hacia Z positivo.",
        ),
        ProfileError::Arc => (
            "ARC_IN_PROFILE",
            "El arco no es monótono en Z o no se puede aproximar con tramos exteriores; se conserva el último bloque completo.",
        ),
        ProfileError::Geometry(GeometryError::Limit) => (
            "PROFILE_LIMIT",
            "Se alcanzó el límite de complejidad; se conserva el último bloque completo.",
        ),
        ProfileError::Geometry(GeometryError::AmbiguousComparison) => (
            "PROFILE_NUMERICAL_AMBIGUITY",
            "La precisión del modelo no permite confirmar este corte o contacto; se conserva el perfil anterior.",
        ),
        ProfileError::Geometry(GeometryError::UnrepresentableIntersection) => (
            "PROFILE_NUMERICAL_INTERSECTION",
            "La intersección es demasiado pequeña para representarla con estas coordenadas; se conserva el perfil anterior.",
        ),
        _ => (
            "INVALID_PROFILE_REQUEST",
            "Perfil no evaluado: programa, material, cursor o referencia geométrica inválidos.",
        ),
    };
    Diagnostic {
        code: code.into(),
        severity: Severity::Warning,
        span,
        message: message.into(),
        point: None,
    }
}

/// `z(θ) = zc + R·cosθ` is monotonic on the sweep unless `sinθ` changes sign
/// strictly inside it (θ = 0 or π, modulo 2π). A critical angle exactly at an
/// endpoint keeps monotonicity, as in a semicircle.
fn arc_z_monotonic(start_angle: f64, sweep: f64) -> bool {
    let lo = start_angle.min(start_angle + sweep);
    let hi = start_angle.max(start_angle + sweep);
    let step = std::f64::consts::TAU;
    for base in [0.0, std::f64::consts::PI] {
        let first = ((lo - base) / step).ceil();
        for k in [first - 1.0, first, first + 1.0] {
            let angle = base + step * k;
            if angle > lo && angle < hi {
                return false;
            }
        }
    }
    true
}

/// Classify the circle itself against the current piecewise linear stock, not
/// its display chords. On a Z-monotone sweep the circle is one signed square-root
/// branch. Its difference from a line has extrema only at interval boundaries
/// and where dz = slope * signed_radius / hypot(1, slope).
/// Near-roundoff comparisons freeze explicitly rather than certifying air.
fn arc_penetrates(
    profile: &LinearProfile,
    from: Position,
    to: Position,
    arc: &ArcGeometry,
    budget: &mut GeometryBudget,
) -> Result<bool, ProfileError> {
    if !arc.radius_mm.is_finite()
        || arc.radius_mm <= 0.0
        || arc.radius_mm > MAX_MAGNITUDE
        || !arc.sweep_rad.is_finite()
        || arc.sweep_rad <= 0.0
        || arc.sweep_rad >= std::f64::consts::TAU
        || !arc.center.r_mm.is_finite()
        || !arc.center.z_mm.is_finite()
    {
        return Err(ProfileError::Invalid);
    }
    let start_angle = (from.r_mm - arc.center.r_mm).atan2(from.z_mm - arc.center.z_mm);
    let sweep = if arc.clockwise {
        -arc.sweep_rad
    } else {
        arc.sweep_rad
    };
    if !arc_z_monotonic(start_angle, sweep) {
        return Err(ProfileError::Arc);
    }
    let side = (start_angle + sweep / 2.0).sin().signum();
    let mut ambiguous = false;
    for span in profile.spans() {
        budget.charge()?;
        let lo = span.z_start_mm.max(from.z_mm.min(to.z_mm));
        let hi = span.z_end_mm.min(from.z_mm.max(to.z_mm));
        if lo >= hi {
            continue;
        }
        let slope = (span.r_end_mm - span.r_start_mm) / (span.z_end_mm - span.z_start_mm);
        if !slope.is_finite() {
            ambiguous = true;
            continue;
        }
        let stationary = arc.center.z_mm - side * arc.radius_mm * (slope / slope.hypot(1.0));
        for z in [lo, hi, stationary] {
            budget.charge()?;
            if !z.is_finite() || z < lo || z > hi {
                continue;
            }
            let t = (z - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
            let stock_r = if z == span.z_start_mm {
                span.r_start_mm
            } else if z == span.z_end_mm {
                span.r_end_mm
            } else {
                span.r_start_mm * (1.0 - t) + span.r_end_mm * t
            };
            // Preserve interpreted endpoints as additional witnesses, including
            // an exact tangent/contact. Interior extrema still check the circle.
            let endpoint = if z == from.z_mm {
                Some(from.r_mm)
            } else if z == to.z_mm {
                Some(to.r_mm)
            } else {
                None
            };
            if let Some(r) = endpoint {
                match checked_difference(r, stock_r) {
                    Ok(d) if d < 0.0 => return Ok(true),
                    Err(_) => ambiguous = true,
                    _ => {}
                }
            }
            let dz = z - arc.center.z_mm;
            let radicand = (arc.radius_mm - dz.abs()) * (arc.radius_mm + dz.abs());
            if radicand < 0.0 || !radicand.is_finite() {
                ambiguous = true;
                continue;
            }
            let radial = radicand.sqrt();
            let r = arc.center.r_mm + side * radial;
            let difference = r - stock_r;
            // Near a vertical tangent sqrt amplifies coordinate roundoff. This
            // is a numerical guard only: never turn it into physical clearance.
            let scale = arc.center.r_mm.abs()
                + stock_r.abs()
                + arc.radius_mm
                + arc.center.z_mm.abs()
                + z.abs();
            let coordinate_error = scale.max(f64::MIN_POSITIVE) * f64::EPSILON * 128.0;
            // |sqrt(a)-sqrt(b)| <= sqrt(|a-b|), including at zero.
            let root_error = (coordinate_error * (2.0 * arc.radius_mm + coordinate_error)).sqrt();
            let guard = coordinate_error * (1.0 + slope.abs()) + root_error;
            if difference < -guard {
                return Ok(true);
            }
            if difference <= guard {
                // Exact stored endpoint contact can be a legitimate extremum;
                // a reconstructed circle disagreement is still ambiguous.
                if endpoint != Some(stock_r) || difference != 0.0 {
                    ambiguous = true;
                }
            }
        }
    }
    if ambiguous {
        Err(ProfileError::Geometry(GeometryError::AmbiguousComparison))
    } else {
        Ok(false)
    }
}

/// Flatten a monotonic arc into ordered linear spans. The first and last points
/// keep the interpreted endpoints exactly; interior points lie on the circle.
fn arc_linear_spans(
    from: Position,
    to: Position,
    arc: &ArcGeometry,
) -> Result<Vec<LinearProfileSpan>, ProfileError> {
    let radius = arc.radius_mm;
    if !radius.is_finite()
        || radius <= 0.0
        || radius > MAX_MAGNITUDE
        || !arc.sweep_rad.is_finite()
        || arc.sweep_rad <= 0.0
        || arc.sweep_rad >= std::f64::consts::TAU
    {
        return Err(ProfileError::Invalid);
    }
    let start_angle = (from.r_mm - arc.center.r_mm).atan2(from.z_mm - arc.center.z_mm);
    let sweep = if arc.clockwise {
        -arc.sweep_rad
    } else {
        arc.sweep_rad
    };
    if !arc_z_monotonic(start_angle, sweep) {
        return Err(ProfileError::Arc);
    }
    let delta_max = if radius <= ARC_CHORD_TOLERANCE_MM {
        std::f64::consts::PI
    } else {
        2.0 * (1.0 - ARC_CHORD_TOLERANCE_MM / radius).acos()
    };
    if !delta_max.is_finite() || delta_max <= 0.0 {
        return Err(ProfileError::Invalid);
    }
    let count = (arc.sweep_rad / delta_max).ceil();
    if !count.is_finite() || count < 1.0 {
        return Err(ProfileError::Invalid);
    }
    let count = count as usize;
    if count > MAX_ARC_SEGMENTS {
        return Err(ProfileError::Geometry(GeometryError::Limit));
    }
    let mut spans = Vec::with_capacity(count);
    let mut previous = from;
    for index in 1..=count {
        let angle = start_angle + sweep * (index as f64 / count as f64);
        let point = if index == count {
            to
        } else {
            Position {
                r_mm: arc.center.r_mm + radius * angle.sin(),
                z_mm: arc.center.z_mm + radius * angle.cos(),
            }
        };
        let (low, high) = if previous.z_mm < point.z_mm {
            (previous, point)
        } else {
            (point, previous)
        };
        if low.z_mm >= high.z_mm || low.r_mm < 0.0 || high.r_mm < 0.0 {
            return Err(ProfileError::Arc);
        }
        spans.push(LinearProfileSpan {
            z_start_mm: low.z_mm,
            z_end_mm: high.z_mm,
            r_start_mm: low.r_mm,
            r_end_mm: high.r_mm,
        });
        previous = point;
    }
    Ok(spans)
}

/// Apply one interpreted motion to the exterior profile: `Ok(None)` when it stays
/// in air, `Ok(Some(next))` when it removes material, `Err` when this model must
/// freeze before the block. Shared with the educational collision check.
pub(crate) fn step_motion(
    base: &LinearProfile,
    motion: &Motion,
    block: &Block,
    stock: &Stock,
    budget: &mut GeometryBudget,
) -> Result<Option<LinearProfile>, ProfileError> {
    // Arcs are flattened into monotonic linear spans with a bounded
    // chord tolerance. Non-monotonic arcs cannot be represented by
    // z -> r spans, so the profile freezes instead of guessing.
    if motion.kind.is_arc() {
        let arc = motion.arc.ok_or(ProfileError::Invalid)?;
        if arc.clockwise != (motion.kind == MotionKind::ArcCw) {
            return Err(ProfileError::Invalid);
        }
        if !arc_penetrates(base, motion.from, motion.to, &arc, budget)? {
            return Ok(None);
        }
        if !block.after_state.spindle_on
            || !block.after_state.spindle_rpm.is_finite()
            || block.after_state.spindle_rpm <= 0.0
        {
            return Err(ProfileError::Spindle);
        }
        if motion.to.z_mm >= motion.from.z_mm {
            return Err(ProfileError::Unsupported);
        }
        let spans = arc_linear_spans(motion.from, motion.to, &arc)?;
        let mut working: Option<LinearProfile> = None;
        let mut removed = false;
        for span in spans {
            let start = Position {
                r_mm: span.r_start_mm,
                z_mm: span.z_start_mm,
            };
            let end = Position {
                r_mm: span.r_end_mm,
                z_mm: span.z_end_mm,
            };
            let touches = match &working {
                Some(profile) => profile.penetrates(start, end, budget)?,
                None => base.penetrates(start, end, budget)?,
            };
            if !touches {
                continue;
            }
            removed = true;
            if !block.after_state.spindle_on
                || !block.after_state.spindle_rpm.is_finite()
                || block.after_state.spindle_rpm <= 0.0
            {
                return Err(ProfileError::Spindle);
            }
            if motion.to.z_mm >= motion.from.z_mm {
                return Err(ProfileError::Unsupported);
            }
            working = Some(match working.take() {
                Some(profile) => profile.cut(&span, budget)?,
                None => base.cut(&span, budget)?,
            });
        }
        if !removed {
            // The true arc removes material, but every bounded chord
            // is in air. Do not silently lose a sub-tolerance cut.
            return Err(ProfileError::Geometry(GeometryError::AmbiguousComparison));
        }
        return Ok(working);
    }
    if motion.from.z_mm == motion.to.z_mm {
        let z_cut = motion.from.z_mm;
        let is_facing = motion.kind == MotionKind::Linear
            && motion.from.r_mm > motion.to.r_mm
            && motion.to.r_mm == 0.0;
        if is_facing && z_cut > -stock.length_mm && z_cut <= 0.0 {
            let max_r = base.max_radius_in(z_cut, 0.0, budget)?;
            if max_r == 0.0 {
                return Ok(None);
            }
            if !block.after_state.spindle_on
                || !block.after_state.spindle_rpm.is_finite()
                || block.after_state.spindle_rpm <= 0.0
            {
                return Err(ProfileError::Spindle);
            }
            if checked_difference(motion.from.r_mm, max_r)? < 0.0 {
                return Err(ProfileError::Unsupported);
            }
            return Ok(Some(base.face_to(z_cut, budget)?));
        }
        if !base.penetrates(motion.from, motion.to, budget)? {
            return Ok(None);
        }
        if motion.lead {
            return Err(ProfileError::Lead);
        }
        if motion.kind == MotionKind::Rapid {
            return Err(ProfileError::Rapid);
        }
        return Err(ProfileError::Unsupported);
    }
    if !base.penetrates(motion.from, motion.to, budget)? {
        return Ok(None);
    }
    if motion.lead {
        return Err(ProfileError::Lead);
    }
    if motion.kind == MotionKind::Rapid {
        return Err(ProfileError::Rapid);
    }
    if !block.after_state.spindle_on
        || !block.after_state.spindle_rpm.is_finite()
        || block.after_state.spindle_rpm <= 0.0
    {
        return Err(ProfileError::Spindle);
    }
    if motion.to.z_mm >= motion.from.z_mm {
        return Err(ProfileError::Unsupported);
    }
    Ok(Some(base.cut(
        &LinearProfileSpan {
            z_start_mm: motion.to.z_mm,
            z_end_mm: motion.from.z_mm,
            r_start_mm: motion.to.r_mm,
            r_end_mm: motion.from.r_mm,
        },
        budget,
    )?))
}

/// Reconstruct an ideal point-tool exterior from a block prefix, including tapers.
/// The interpreter owns all modal semantics. Unsupported/ambiguous blocks freeze
/// geometry before the whole block, independently of the UI execution cursor.
pub fn profile_at_v2(
    program: &CompileResult,
    stock: &Stock,
    completed_blocks: usize,
) -> StockProfileV2 {
    let fallback = SourceSpan {
        line: 1,
        column_start: 1,
        column_end: 1,
    };
    let mut result = StockProfileV2 {
        profile_version: 2,
        source_revision: program.source_revision,
        completed_blocks,
        evaluated_blocks: 0,
        complete: false,
        spans: Vec::new(),
        diagnostics: Vec::new(),
    };
    let valid_stock = [stock.diameter_mm, stock.length_mm]
        .iter()
        .all(|v| v.is_finite() && *v > 0.0 && *v <= MAX_MAGNITUDE)
        && stock.diameter_mm / 2.0 > 0.0;
    if valid_stock {
        result.spans.push(LinearProfileSpan {
            z_start_mm: -stock.length_mm,
            z_end_mm: 0.0,
            r_start_mm: stock.diameter_mm / 2.0,
            r_end_mm: stock.diameter_mm / 2.0,
        });
    }
    let initial = program.initial_state.position;
    if !valid_stock
        || program.api_version != 1
        || program.dialect != crate::DIALECT
        || !program.executable
        || completed_blocks > program.blocks.len()
        || !initial.r_mm.is_finite()
        || initial.r_mm < 0.0
        || initial.r_mm > MAX_MAGNITUDE
        || !initial.z_mm.is_finite()
        || initial.z_mm.abs() > MAX_MAGNITUDE
    {
        result
            .diagnostics
            .push(diagnostic(ProfileError::Invalid, fallback));
        return result;
    }
    if -stock.length_mm < initial.z_mm
        && initial.z_mm < 0.0
        && initial.r_mm < stock.diameter_mm / 2.0
    {
        result.diagnostics.push(Diagnostic {
            code: "INITIAL_TOOL_IN_STOCK".into(),
            severity: Severity::Warning,
            span: fallback,
            message: "La posición inicial está dentro del material; el perfil queda congelado."
                .into(),
            point: None,
        });
        return result;
    }
    let mut budget = GeometryBudget::default();
    // A single valid cylinder cannot exhaust this fresh budget.
    let mut geometry = match LinearProfile::new(result.spans.clone(), &mut budget) {
        Ok(profile) => profile,
        Err(error) => {
            result.diagnostics.push(diagnostic(error.into(), fallback));
            return result;
        }
    };
    for (index, block) in program.blocks.iter().take(completed_blocks).enumerate() {
        let mut candidate: Option<LinearProfile> = None;
        let outcome: Result<(), ProfileError> = (|| {
            budget.charge()?;
            for id in &block.motion_ids {
                let motion = program.motions.get(*id).ok_or(ProfileError::Invalid)?;
                if motion.block_id != index {
                    return Err(ProfileError::Invalid);
                }
                let base = candidate.as_ref().unwrap_or(&geometry);
                if let Some(next) = step_motion(base, motion, block, stock, &mut budget)? {
                    candidate = Some(next);
                }
            }
            Ok(())
        })();
        if let Err(error) = outcome {
            result.spans = geometry.spans().to_vec();
            result.diagnostics.push(diagnostic(error, block.span));
            return result;
        }
        if let Some(next) = candidate {
            geometry = next;
        }
        result.evaluated_blocks = index + 1;
    }
    result.spans = geometry.spans().to_vec();
    result.complete = true;
    result
}
