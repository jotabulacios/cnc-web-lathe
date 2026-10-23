//! Static educational tool-offset table, edu-lathe-v2 only.
//! User-facing convention: X values in DIAMETER, Z in mm; positive values move
//! the physical tip away (larger diameter / larger Z). Physical tip =
//! programmed point + calibration error + wear. Converted to radius once here and
//! resolved through `tool_reference` so its numerical guards apply.
//! Activation happens with the next motion: a T block moves nothing, and the
//! following motion runs from the previous physical tip to the corrected target.
use serde::{Deserialize, Serialize};

use crate::tool_reference::{ReferenceError, ToolCalibration, ToolVector, resolve_reference};
use crate::*;

/// Educational bound for offset entries, in mm. Not a controller limit.
pub const MAX_OFFSET_MM: f64 = 100.0;
/// Educational bound for the nose radius, in mm.
pub const MAX_NOSE_RADIUS_MM: f64 = 5.0;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolOffset {
    pub tool_id: String,
    /// Real minus registered tool geometry ("error de reglaje"). X in diameter.
    pub calibration_error_x_mm: f64,
    pub calibration_error_z_mm: f64,
    /// Wear correction entered by the operator. X in diameter.
    pub wear_x_mm: f64,
    pub wear_z_mm: f64,
    /// Nose radius ρ in mm (radius, not diameter). 0 = ideal point.
    #[serde(default)]
    pub nose_radius_mm: f64,
}

impl ToolOffset {
    fn values(&self) -> [f64; 4] {
        [
            self.calibration_error_x_mm,
            self.calibration_error_z_mm,
            self.wear_x_mm,
            self.wear_z_mm,
        ]
    }
    fn is_zero(&self) -> bool {
        self.values().iter().all(|v| *v == 0.0)
    }
}

pub(crate) fn offsets_error(offsets: &[ToolOffset]) -> Option<&'static str> {
    let mut seen = Vec::new();
    for offset in offsets {
        if !(crate::interpreter::is_supported_tool(&offset.tool_id)
            || offset.tool_id == "boring-id")
            || seen.contains(&offset.tool_id.as_str())
        {
            return Some("Tabla de correctores: una fila por herramienta soportada, sin repetir.");
        }
        if !offset
            .values()
            .iter()
            .all(|v| v.is_finite() && v.abs() <= MAX_OFFSET_MM)
        {
            return Some("Tabla de correctores: valores finitos de hasta ±100 mm.");
        }
        if !(offset.nose_radius_mm.is_finite()
            && (0.0..=MAX_NOSE_RADIUS_MM).contains(&offset.nose_radius_mm))
        {
            return Some("Tabla de correctores: radio de punta entre 0 y 5 mm.");
        }
        seen.push(offset.tool_id.as_str());
    }
    None
}

/// Physical tip in work coordinates for a programmed point. A missing or all-zero
/// row returns the programmed point bit-for-bit.
pub fn physical_tip(
    programmed: Position,
    offset: Option<&ToolOffset>,
) -> Result<Position, ReferenceError> {
    let Some(offset) = offset.filter(|o| !o.is_zero()) else {
        return Ok(programmed);
    };
    let calibration = ToolCalibration {
        actual_tip_from_mount: ToolVector {
            r_mm: offset.calibration_error_x_mm / 2.0,
            z_mm: offset.calibration_error_z_mm,
        },
        geometry_register: ToolVector {
            r_mm: 0.0,
            z_mm: 0.0,
        },
        wear_register: ToolVector {
            r_mm: -offset.wear_x_mm / 2.0,
            z_mm: -offset.wear_z_mm,
        },
    };
    resolve_reference(programmed, 0.0, calibration).map(|state| state.physical_tip_work)
}

fn reference_message(error: ReferenceError) -> &'static str {
    match error {
        ReferenceError::AxisCrossing => {
            "El corrector lleva la punta física al otro lado del eje (radio negativo)."
        }
        ReferenceError::NumericalAmbiguity => {
            "El corrector es demasiado pequeño frente a la coordenada: el resultado sería ambiguo."
        }
        ReferenceError::RangeExceeded | ReferenceError::InvalidInput => {
            "El corrector lleva la punta fuera del rango admitido."
        }
    }
}

/// Rewrites motions as the physical tip path and records `tip_position` on every
/// state. Atomic like compilation: any failure leaves a non-executable result.
pub(crate) fn apply_tool_offsets(result: &mut CompileResult, offsets: &[ToolOffset]) {
    if !result.executable {
        return;
    }
    let fallback = SourceSpan {
        line: 1,
        column_start: 1,
        column_end: 1,
    };
    let outcome = if let Some(message) = offsets_error(offsets) {
        Err(Diagnostic::error("INVALID_REQUEST", fallback, message))
    } else {
        rewrite(result, offsets)
    };
    if let Err(diagnostic) = outcome {
        result.initial_state.tip_position = None;
        result.diagnostics.push(diagnostic);
        result.executable = false;
        result.blocks.clear();
        result.motions.clear();
        result.final_state = None;
    }
}

fn rewrite(result: &mut CompileResult, offsets: &[ToolOffset]) -> Result<(), Diagnostic> {
    let row = |tool_id: &str| offsets.iter().find(|o| o.tool_id == tool_id);
    let mut tip = result.initial_state.position;
    result.initial_state.tip_position = Some(tip);
    let motions = &mut result.motions;
    for block in result.blocks.iter_mut() {
        block.before_state.tip_position = Some(tip);
        for &id in &block.motion_ids {
            let motion = &mut motions[id];
            let offset = row(&motion.tool_id);
            let fail =
                |error| Diagnostic::error("TOOL_OFFSET", motion.span, reference_message(error));
            let to = physical_tip(motion.to, offset).map_err(fail)?;
            if let Some(arc) = motion.arc.as_mut() {
                // A translated arc keeps its radius only if both ends move together.
                // This also covers an arc as first motion: the setup tool's
                // correction, like any other, is applied by a linear or rapid move.
                if physical_tip(motion.from, offset).map_err(fail)? != tip {
                    return Err(Diagnostic::error(
                        "OFFSET_BEFORE_ARC",
                        motion.span,
                        "El arco empezaría desde una punta sin el corrector actual. El corrector se aplica con un movimiento lineal o rápido: agregá uno antes del arco.",
                    ));
                }
                arc.center.r_mm += to.r_mm - motion.to.r_mm;
                arc.center.z_mm += to.z_mm - motion.to.z_mm;
                // Endpoints are guarded by the kernel; the translated sweep is not.
                let start = (tip.r_mm - arc.center.r_mm).atan2(tip.z_mm - arc.center.z_mm);
                let sweep = if arc.clockwise {
                    -arc.sweep_rad
                } else {
                    arc.sweep_rad
                };
                if crate::interpreter::arc_min_radius(
                    tip.r_mm,
                    to.r_mm,
                    arc.center.r_mm,
                    arc.radius_mm,
                    start,
                    sweep,
                ) < 0.0
                {
                    return Err(fail(ReferenceError::AxisCrossing));
                }
            } else {
                motion.length_mm = (to.r_mm - tip.r_mm).hypot(to.z_mm - tip.z_mm);
            }
            motion.from = tip;
            motion.to = to;
            tip = to;
        }
        block.after_state.tip_position = Some(tip);
    }
    if let Some(state) = result.final_state.as_mut() {
        state.tip_position = Some(tip);
    }
    Ok(())
}
