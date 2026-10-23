//! Exact exterior profile for an ideal point tool and axial, negative-Z turning.
//! This geometry estimate deliberately does not change interpreter execution.
use crate::{
    CompileResult, Diagnostic, MAX_MAGNITUDE, Motion, MotionKind, Position, Severity, SourceSpan,
    Stock,
};
use serde::{Deserialize, Serialize};

pub const MAX_PROFILE_SPANS: usize = 4096;
pub const MAX_PROFILE_OPERATIONS: usize = 2_000_000;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSpan {
    pub z_start_mm: f64,
    pub z_end_mm: f64,
    pub radius_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockProfile {
    pub profile_version: u32,
    pub source_revision: u32,
    pub completed_blocks: usize,
    pub evaluated_blocks: usize,
    pub complete: bool,
    pub spans: Vec<ProfileSpan>,
    pub diagnostics: Vec<Diagnostic>,
}

fn warning(code: &str, span: SourceSpan, message: &str) -> Diagnostic {
    Diagnostic {
        code: code.into(),
        severity: Severity::Warning,
        span,
        message: message.into(),
        point: None,
    }
}
fn valid_position(p: Position) -> bool {
    p.r_mm.is_finite()
        && p.z_mm.is_finite()
        && p.r_mm >= 0.0
        && p.r_mm <= MAX_MAGNITUDE
        && p.z_mm.abs() <= MAX_MAGNITUDE
}
fn charge(operations: &mut usize, count: usize) -> Result<(), &'static str> {
    *operations = operations.saturating_add(count);
    if *operations > MAX_PROFILE_OPERATIONS {
        Err("PROFILE_LIMIT")
    } else {
        Ok(())
    }
}

// Open material interiors exclude the faces. At an internal shoulder, the
// lower of both neighboring radii permits contact/retraction after a cut.
fn radius_at_boundary(
    spans: &[ProfileSpan],
    z: f64,
    operations: &mut usize,
) -> Result<f64, &'static str> {
    if spans.is_empty() || z <= spans[0].z_start_mm || z >= spans[spans.len() - 1].z_end_mm {
        return Ok(0.0);
    }
    let mut radius = f64::INFINITY;
    for span in spans {
        charge(operations, 1)?;
        if span.z_start_mm <= z && z <= span.z_end_mm {
            radius = radius.min(span.radius_mm);
        }
    }
    Ok(if radius.is_finite() { radius } else { 0.0 })
}
fn enters_material(
    spans: &[ProfileSpan],
    motion: &Motion,
    operations: &mut usize,
) -> Result<bool, &'static str> {
    let from = motion.from;
    let to = motion.to;
    if from.z_mm == to.z_mm {
        return Ok(from.r_mm.min(to.r_mm) < radius_at_boundary(spans, from.z_mm, operations)?);
    }
    for span in spans {
        charge(operations, 1)?;
        let lo = from.z_mm.min(to.z_mm).max(span.z_start_mm);
        let hi = from.z_mm.max(to.z_mm).min(span.z_end_mm);
        if lo < hi {
            let radius = |z: f64| {
                if from.r_mm == to.r_mm {
                    return from.r_mm;
                }
                let t = (z - from.z_mm) / (to.z_mm - from.z_mm);
                from.r_mm * (1.0 - t) + to.r_mm * t
            };
            // The infimum suffices on an open interval: strict penetration
            // implies a nonempty interval inside, whereas mere contact does not.
            if radius(lo).min(radius(hi)) < span.radius_mm {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn push_merged(out: &mut Vec<ProfileSpan>, start: f64, end: f64, radius: f64) {
    if start >= end {
        return;
    }
    if let Some(last) = out.last_mut()
        && last.z_end_mm == start
        && last.radius_mm == radius
    {
        last.z_end_mm = end;
        return;
    }
    out.push(ProfileSpan {
        z_start_mm: start,
        z_end_mm: end,
        radius_mm: radius,
    });
}
fn cut(
    spans: &[ProfileSpan],
    motion: &Motion,
    operations: &mut usize,
) -> Result<Vec<ProfileSpan>, &'static str> {
    let lo = motion.to.z_mm;
    let hi = motion.from.z_mm;
    let mut out = Vec::with_capacity(spans.len().saturating_add(2).min(MAX_PROFILE_SPANS + 2));
    for span in spans {
        charge(operations, 1)?;
        let a = lo.max(span.z_start_mm);
        let b = hi.min(span.z_end_mm);
        if a < b {
            push_merged(&mut out, span.z_start_mm, a, span.radius_mm);
            push_merged(&mut out, a, b, span.radius_mm.min(motion.to.r_mm));
            push_merged(&mut out, b, span.z_end_mm, span.radius_mm);
        } else {
            push_merged(&mut out, span.z_start_mm, span.z_end_mm, span.radius_mm);
        }
        if out.len() > MAX_PROFILE_SPANS {
            return Err("PROFILE_LIMIT");
        }
    }
    Ok(out)
}

/// Reconstruct geometry from an interpreted block prefix, independently of UI
/// stepping direction. Unsupported material contact freezes the last valid prefix.
pub fn profile_at(program: &CompileResult, stock: &Stock, completed_blocks: usize) -> StockProfile {
    let fallback_span = SourceSpan {
        line: 1,
        column_start: 1,
        column_end: 1,
    };
    let mut result = StockProfile {
        profile_version: 1,
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
        result.spans.push(ProfileSpan {
            z_start_mm: -stock.length_mm,
            z_end_mm: 0.0,
            radius_mm: stock.diameter_mm / 2.0,
        });
    }
    if !valid_stock
        || program.api_version != 1
        || program.dialect != crate::DIALECT
        || !program.executable
        || completed_blocks > program.blocks.len()
        || !valid_position(program.initial_state.position)
    {
        result.diagnostics.push(warning(
            "INVALID_PROFILE_REQUEST",
            fallback_span,
            "Perfil no evaluado: programa, material o cursor inválido.",
        ));
        return result;
    }
    let initial = program.initial_state.position;
    if -stock.length_mm < initial.z_mm
        && initial.z_mm < 0.0
        && initial.r_mm < stock.diameter_mm / 2.0
    {
        result.diagnostics.push(warning(
            "INITIAL_TOOL_IN_STOCK",
            fallback_span,
            "La posición inicial está dentro del material; el perfil queda congelado.",
        ));
        return result;
    }
    let mut operations = 0;
    for (index, block) in program.blocks.iter().take(completed_blocks).enumerate() {
        // Allocate replacement geometry only on an actual cut. All changes of
        // one block remain local until every motion has passed validation.
        let mut candidate: Option<Vec<ProfileSpan>> = None;
        let outcome: Result<(), &'static str> = (|| {
            charge(&mut operations, 1)?;
            for motion_id in &block.motion_ids {
                let motion = program
                    .motions
                    .get(*motion_id)
                    .ok_or("INVALID_PROFILE_REQUEST")?;
                if motion.block_id != index
                    || !valid_position(motion.from)
                    || !valid_position(motion.to)
                {
                    return Err("INVALID_PROFILE_REQUEST");
                }
                let spans = candidate.as_deref().unwrap_or(&result.spans);
                // Legacy v1 cannot model arcs; do not approximate them as chords.
                if motion.kind.is_arc() {
                    return Err("ARC_IN_PROFILE");
                }
                if !enters_material(spans, motion, &mut operations)? {
                    continue;
                }
                if motion.kind == MotionKind::Rapid {
                    return Err("RAPID_IN_STOCK");
                }
                if !block.after_state.spindle_on
                    || !block.after_state.spindle_rpm.is_finite()
                    || block.after_state.spindle_rpm <= 0.0
                {
                    return Err("SPINDLE_OFF");
                }
                if motion.from.r_mm != motion.to.r_mm || motion.to.z_mm >= motion.from.z_mm {
                    return Err("UNSUPPORTED_PROFILE_CUT");
                }
                candidate = Some(cut(spans, motion, &mut operations)?);
            }
            Ok(())
        })();
        if let Err(code) = outcome {
            let message = match code {
                "RAPID_IN_STOCK" => {
                    "Un rápido entra en material; el perfil se detiene antes de este bloque."
                }
                "SPINDLE_OFF" => {
                    "El avance entra en material sin husillo encendido y RPM positivas."
                }
                "UNSUPPORTED_PROFILE_CUT" => {
                    "El perfil admite solamente cilindrado exterior G01 a radio constante hacia Z negativo."
                }
                "ARC_IN_PROFILE" => {
                    "Los arcos G02/G03 todavía no se modelan en el perfil; se conserva el último bloque completo."
                }
                "PROFILE_LIMIT" => {
                    "Se alcanzó el límite de complejidad del perfil; se conserva el último bloque completo."
                }
                _ => "El programa interpretado contiene una referencia geométrica inválida.",
            };
            result.diagnostics.push(warning(code, block.span, message));
            return result;
        }
        if let Some(spans) = candidate {
            result.spans = spans;
        }
        result.evaluated_blocks = index + 1;
    }
    result.complete = true;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn span_limit_and_operation_budget_are_transactional() {
        let spans: Vec<_> = (0..MAX_PROFILE_SPANS)
            .map(|i| ProfileSpan {
                z_start_mm: i as f64,
                z_end_mm: i as f64 + 1.0,
                radius_mm: if i % 2 == 0 { 2.0 } else { 1.0 },
            })
            .collect();
        let original = spans.clone();
        let motion = Motion {
            id: 0,
            block_id: 0,
            span: SourceSpan {
                line: 1,
                column_start: 1,
                column_end: 1,
            },
            kind: MotionKind::Linear,
            from: Position {
                r_mm: 0.0,
                z_mm: 0.75,
            },
            to: Position {
                r_mm: 0.0,
                z_mm: 0.25,
            },
            arc: None,
            feed_mm_min: Some(100.0),
            tool_id: "generic-od".into(),
            length_mm: 0.5,
            lead: false,
            feed_mm_rev: None,
            time_s: None,
        };
        assert_eq!(cut(&spans, &motion, &mut 0).unwrap_err(), "PROFILE_LIMIT");
        assert_eq!(spans, original);
        let mut operations = MAX_PROFILE_OPERATIONS;
        assert_eq!(
            cut(&spans, &motion, &mut operations).unwrap_err(),
            "PROFILE_LIMIT"
        );
        assert_eq!(spans, original);
    }
}
