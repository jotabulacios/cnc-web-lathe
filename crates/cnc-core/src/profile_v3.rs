//! Straight-move annular stock reconstruction, additive to the v1/v2 profiles.
use crate::annular_profile::{AnnularError, AnnularProfile, AnnularProfileSpan};
use crate::linear_profile::{GeometryBudget, GeometryError, LinearProfileSpan};
use crate::{CompileResult, Diagnostic, MotionKind, Severity, SourceSpan, Stock};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockProfileV3 {
    pub profile_version: u32,
    pub source_revision: u32,
    pub completed_blocks: usize,
    pub evaluated_blocks: usize,
    pub complete: bool,
    pub spans: Vec<AnnularProfileSpan>,
    pub volume_mm3: f64,
    pub diagnostics: Vec<Diagnostic>,
}

fn warning(code: &str, span: SourceSpan, message: &str) -> Diagnostic {
    Diagnostic {
        code: code.into(),
        severity: Severity::Warning,
        span,
        message: message.into(),
    }
}

fn geometry_warning(error: AnnularError, span: SourceSpan) -> Diagnostic {
    let (code, message) = match error {
        AnnularError::WallCrossing => (
            "PROFILE_WALL_CROSSING",
            "El corte cruza la pared opuesta del material; se conserva el bloque anterior.",
        ),
        AnnularError::Geometry(GeometryError::Limit) => (
            "PROFILE_LIMIT",
            "Se alcanzó el límite de complejidad del perfil.",
        ),
        AnnularError::Geometry(GeometryError::AmbiguousComparison) => (
            "PROFILE_NUMERICAL_AMBIGUITY",
            "La precisión no permite confirmar el contacto o corte; se conserva el bloque anterior.",
        ),
        AnnularError::Geometry(GeometryError::UnrepresentableIntersection) => (
            "PROFILE_NUMERICAL_INTERSECTION",
            "La intersección no es representable con estas coordenadas.",
        ),
        _ => (
            "INVALID_PROFILE_REQUEST",
            "Programa, material, cursor o geometría inválidos.",
        ),
    };
    warning(code, span, message)
}

/// T5 means internal point removal, other supported tools mean exterior removal.
/// Only G00/G01 are classified. Arcs freeze explicitly, even if their endpoints
/// are in air. Complete inward exterior facing is supported. No drilling, partial radial cutting, reverse cuts or holder model.
pub fn profile_at_v3(
    program: &CompileResult,
    stock: &Stock,
    inner_diameter_mm: f64,
    completed_blocks: usize,
) -> StockProfileV3 {
    let fallback = SourceSpan {
        line: 1,
        column_start: 1,
        column_end: 1,
    };
    let mut result = StockProfileV3 {
        profile_version: 3,
        source_revision: program.source_revision,
        completed_blocks,
        evaluated_blocks: 0,
        complete: false,
        spans: Vec::new(),
        volume_mm3: 0.0,
        diagnostics: Vec::new(),
    };
    let mut budget = GeometryBudget::default();
    let mut geometry = match AnnularProfile::cylinder(
        stock.diameter_mm,
        inner_diameter_mm,
        stock.length_mm,
        &mut budget,
    ) {
        Ok(profile) => profile,
        Err(error) => {
            result.diagnostics.push(geometry_warning(error, fallback));
            return result;
        }
    };
    result.spans = geometry.spans().to_vec();
    result.volume_mm3 = geometry.volume_mm3();
    if !program.executable
        || program.api_version != 2
        || program.dialect != "edu-lathe-v2"
        || completed_blocks > program.blocks.len()
    {
        result.diagnostics.push(warning(
            "INVALID_PROFILE_REQUEST",
            fallback,
            "Se requiere programa ejecutable v2 y cursor válido.",
        ));
        return result;
    }
    match geometry.penetrates(
        program.initial_state.position,
        program.initial_state.position,
        &mut budget,
    ) {
        Ok(false) => {}
        Ok(true) => {
            result.diagnostics.push(warning(
                "INITIAL_TOOL_IN_STOCK",
                fallback,
                "La posición inicial está dentro del material.",
            ));
            return result;
        }
        Err(error) => {
            result
                .diagnostics
                .push(geometry_warning(error.into(), fallback));
            return result;
        }
    }
    for (index, block) in program.blocks.iter().take(completed_blocks).enumerate() {
        let mut candidate: Option<AnnularProfile> = None;
        let outcome = (|| {
            budget
                .charge()
                .map_err(|e| geometry_warning(e.into(), block.span))?;
            for id in &block.motion_ids {
                let motion = program
                    .motions
                    .get(*id)
                    .filter(|m| m.block_id == index)
                    .ok_or_else(|| {
                        warning(
                            "INVALID_PROFILE_REQUEST",
                            block.span,
                            "Referencia de movimiento inválida.",
                        )
                    })?;
                if motion.kind.is_arc() {
                    return Err(warning(
                        "UNSUPPORTED_ANNULAR_ARC",
                        motion.span,
                        "El perfil tubular inicial admite únicamente G00/G01; no se clasifican arcos por sus extremos.",
                    ));
                }
                let base = candidate.as_ref().unwrap_or(&geometry);
                let penetrates = base
                    .penetrates(motion.from, motion.to, &mut budget)
                    .map_err(|e| geometry_warning(e.into(), motion.span))?;
                if !penetrates {
                    continue;
                }
                if motion.lead {
                    return Err(warning(
                        "COMP_LEAD_IN_STOCK",
                        motion.span,
                        "La entrada o salida de compensación (o un enlace de la punta redonda) atraviesa material. Hacela en el aire.",
                    ));
                }
                if motion.kind == MotionKind::Rapid {
                    return Err(warning(
                        "RAPID_IN_STOCK",
                        motion.span,
                        "Un rápido atraviesa material entre las paredes del tubo.",
                    ));
                }
                if !block.after_state.spindle_on
                    || !block.after_state.spindle_rpm.is_finite()
                    || block.after_state.spindle_rpm <= 0.0
                {
                    return Err(warning(
                        "SPINDLE_OFF",
                        motion.span,
                        "El corte requiere husillo encendido y RPM positivas.",
                    ));
                }
                if motion.to.z_mm == motion.from.z_mm
                    && motion.to.r_mm < motion.from.r_mm
                    && motion.tool_id != "boring-id"
                {
                    let band = base
                        .facing_band(motion.to.z_mm, &mut budget)
                        .map_err(|e| geometry_warning(e, motion.span))?;
                    if let Some((inner, outer)) = band
                        && motion.from.r_mm >= outer
                        && motion.to.r_mm <= inner
                    {
                        candidate = Some(
                            base.face_to(motion.to.z_mm, &mut budget)
                                .map_err(|e| geometry_warning(e, motion.span))?,
                        );
                        continue;
                    }
                }
                if motion.to.z_mm >= motion.from.z_mm {
                    return Err(warning(
                        "UNSUPPORTED_PROFILE_CUT",
                        motion.span,
                        "El perfil tubular admite cortes longitudinales G01 hacia Z negativo; o refrentado exterior completo hacia el agujero; no cortes radiales parciales ni inversos.",
                    ));
                }
                let cutter = LinearProfileSpan {
                    z_start_mm: motion.to.z_mm,
                    z_end_mm: motion.from.z_mm,
                    r_start_mm: motion.to.r_mm,
                    r_end_mm: motion.from.r_mm,
                };
                candidate = Some(if motion.tool_id == "boring-id" {
                    if inner_diameter_mm == 0.0 {
                        return Err(warning("EXISTING_BORE_REQUIRED", motion.span, "El mandrinado requiere un agujero inicial; no se simula taladrado implícito."));
                    }
                    base.bore(&cutter, &mut budget)
                } else {
                    base.cut_outer(&cutter, &mut budget)
                }.map_err(|e| geometry_warning(e, motion.span))?);
            }
            Ok::<(), Diagnostic>(())
        })();
        if let Err(diagnostic) = outcome {
            result.spans = geometry.spans().to_vec();
            result.volume_mm3 = geometry.volume_mm3();
            result.diagnostics.push(diagnostic);
            return result;
        }
        if let Some(next) = candidate {
            geometry = next;
        }
        result.evaluated_blocks = index + 1;
    }
    result.spans = geometry.spans().to_vec();
    result.volume_mm3 = geometry.volume_mm3();
    result.complete = true;
    result
}
