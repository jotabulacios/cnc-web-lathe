use crate::syntax::{Word, line_span, scan};
use crate::*;
use std::collections::HashSet;

pub fn is_supported_tool(tool_id: &str) -> bool {
    matches!(
        tool_id,
        "generic-od" | "roughing-od" | "finishing-od" | "grooving-od" | "facing-od"
    )
}

fn setup_error(req: &CompileRequest, version: u32) -> Option<&'static str> {
    let p = req.setup.initial_position;
    let stock = &req.setup.stock;
    if req.api_version != version {
        return Some("apiVersion no coincide con la interfaz solicitada.");
    }
    if req.dialect
        != if version == 1 {
            DIALECT
        } else {
            "edu-lathe-v2"
        }
    {
        return Some(if version == 1 {
            "Dialect no soportado; usar edu-lathe-v1."
        } else {
            "Dialect no soportado; usar edu-lathe-v2."
        });
    }
    if req.setup.x_convention != "diameter"
        || !(is_supported_tool(&req.setup.tool_id)
            || (version == 2 && req.setup.tool_id == "boring-id"))
    {
        return Some("Este subconjunto requiere X en diámetro y una herramienta soportada.");
    }
    if let Some(offsets) = &req.setup.tool_offsets {
        if version == 1 {
            return Some("edu-lathe-v1 no admite tabla de correctores; usar edu-lathe-v2.");
        }
        if let Some(message) = crate::tool_offsets::offsets_error(offsets) {
            return Some(message);
        }
    }
    if ![p.r_mm, p.z_mm, stock.diameter_mm, stock.length_mm]
        .iter()
        .all(|n| n.is_finite() && n.abs() <= MAX_MAGNITUDE)
        || p.r_mm < 0.0
        || stock.diameter_mm <= 0.0
        || stock.length_mm <= 0.0
    {
        return Some(
            "Setup fuera de rango: radio no negativo, stock positivo, magnitudes ≤1e9 mm.",
        );
    }
    None
}

/// Absolute tolerance for the "endpoint lies on the arc" check, in mm.
/// Educational subset, not a controller tolerance.
pub const ARC_RADIUS_EPS_MM: f64 = 1e-6;

pub(crate) struct PlannedMotion {
    pub(crate) kind: MotionKind,
    pub(crate) arc: Option<ArcGeometry>,
}

struct Step {
    kind: MotionKind,
    to: Position,
    arc: Option<ArcGeometry>,
    feed_mm_min: Option<f64>,
}

/// Minimum radius reached by `(z, r) = (zc + R·cosθ, rc + R·sinθ)` over the sweep.
/// The only interior extremum of `r(θ)` is `sinθ = -1` (r = rc − R).
pub(crate) fn arc_min_radius(
    from_r: f64,
    to_r: f64,
    center_r: f64,
    radius: f64,
    start_angle: f64,
    sweep: f64,
) -> f64 {
    // Interpreted endpoints are exact inputs. Reconstructing them through sin
    // may put an endpoint on X0 a few ulps below zero on one target only.
    let end_angle = start_angle + sweep;
    let mut minimum = from_r.min(to_r);
    let low = start_angle.min(end_angle);
    let high = start_angle.max(end_angle);
    let step = std::f64::consts::TAU;
    let base = -std::f64::consts::FRAC_PI_2;
    let first = ((low - base) / step).floor() + 1.0;
    let angle = base + first * step;
    // Only a strictly interior extremum can improve the exact endpoints.
    // No physical epsilon is used: actual crossings, however small, fail.
    if low < angle && angle < high {
        minimum = minimum.min(center_r - radius);
    }
    minimum
}

fn resolve_arc(
    from: Position,
    to: Position,
    i: f64,
    k: f64,
    mode: MotionKind,
    span: SourceSpan,
) -> Result<ArcGeometry, Diagnostic> {
    let center = Position {
        r_mm: from.r_mm + i,
        z_mm: from.z_mm + k,
    };
    let radius = (from.r_mm - center.r_mm).hypot(from.z_mm - center.z_mm);
    if !radius.is_finite() || radius <= 0.0 || radius > MAX_MAGNITUDE {
        return Err(Diagnostic::error(
            "INVALID_ARC_CENTER",
            span,
            "El centro coincide con el punto de inicio o excede el rango educativo.",
        ));
    }
    let end_radius = (to.r_mm - center.r_mm).hypot(to.z_mm - center.z_mm);
    if (end_radius - radius).abs() > ARC_RADIUS_EPS_MM {
        return Err(Diagnostic::error(
            "ARC_RADIUS_MISMATCH",
            span,
            format!(
                "El punto final no está sobre el arco: radio inicial {radius} mm, radio final {end_radius} mm."
            ),
        ));
    }
    if from.r_mm == to.r_mm && from.z_mm == to.z_mm {
        return Err(Diagnostic::error(
            "DEGENERATE_ARC",
            span,
            "Un arco completo (inicio = fin) no está soportado en torneado exterior.",
        ));
    }
    let start_angle = (from.r_mm - center.r_mm).atan2(from.z_mm - center.z_mm);
    let end_angle = (to.r_mm - center.r_mm).atan2(to.z_mm - center.z_mm);
    let clockwise = mode == MotionKind::ArcCw;
    let mut sweep = end_angle - start_angle;
    if clockwise {
        while sweep >= 0.0 {
            sweep -= std::f64::consts::TAU;
        }
    } else {
        while sweep <= 0.0 {
            sweep += std::f64::consts::TAU;
        }
    }
    if (sweep.abs() - std::f64::consts::TAU).abs() <= 1e-9 {
        return Err(Diagnostic::error(
            "DEGENERATE_ARC",
            span,
            "Un arco de 360° no está soportado en torneado exterior.",
        ));
    }
    if arc_min_radius(from.r_mm, to.r_mm, center.r_mm, radius, start_angle, sweep) < 0.0 {
        return Err(Diagnostic::error(
            "POSITION_RANGE",
            span,
            "El arco cruza el eje del husillo: el radio se vuelve negativo.",
        ));
    }
    Ok(ArcGeometry {
        center,
        radius_mm: radius,
        clockwise,
        sweep_rad: sweep.abs(),
    })
}

pub(crate) fn apply(
    words: &[Word],
    state: &State,
    version: u32,
) -> Result<(State, Option<PlannedMotion>), Diagnostic> {
    let mut next = state.clone();
    let mut seen = HashSet::new();
    let mut groups = HashSet::new();
    let mut x = None;
    let mut z = None;
    let mut u = None;
    let mut w = None;
    let mut i = None;
    let mut k = None;
    // Spindle words are resolved after the loop: S means rpm (G97), m/min (G96)
    // or the rpm limit (G50) depending on the codes of the same block.
    let mut s_word: Option<(f64, SourceSpan)> = None;
    let mut css_word: Option<bool> = None;
    let mut limit_word = false;
    for word in words {
        let error = |code: &str, message: String| Diagnostic::error(code, word.span, message);
        if !matches!(word.letter, 'G' | 'M') && !seen.insert(word.letter) {
            return Err(error(
                "DUPLICATE_WORD",
                format!("Palabra {} repetida.", word.letter),
            ));
        }
        match word.letter {
            'G' | 'M' => {
                let value = word.value;
                if !word.integer_literal || value < 0.0 || value.fract() != 0.0 {
                    return Err(error(
                        "UNSUPPORTED_CODE",
                        format!("Código {}{} no soportado.", word.letter, value),
                    ));
                }
                let (group, supported) = match (word.letter, value as u32) {
                    ('G', 0) => {
                        next.motion = Some(MotionKind::Rapid);
                        ("motion", true)
                    }
                    ('G', 1) => {
                        next.motion = Some(MotionKind::Linear);
                        ("motion", true)
                    }
                    ('G', 2) => {
                        next.motion = Some(MotionKind::ArcCw);
                        ("motion", true)
                    }
                    ('G', 3) => {
                        next.motion = Some(MotionKind::ArcCcw);
                        ("motion", true)
                    }
                    ('G', 18) => ("plane", true),
                    ('G', 40) if version == 2 => {
                        next.compensation = None;
                        ("compensation", true)
                    }
                    ('G', 41 | 42) if version == 2 => {
                        let side = if value as u32 == 41 {
                            Compensation::Left
                        } else {
                            Compensation::Right
                        };
                        if state.compensation.is_some_and(|current| current != side) {
                            return Err(error(
                                "COMP_SIDE_CHANGE",
                                "Cancelá con G40 antes de cambiar entre G41 y G42.".into(),
                            ));
                        }
                        next.compensation = Some(side);
                        ("compensation", true)
                    }
                    ('G', 21) => ("units", true),
                    ('G', 98) => {
                        next.feed_per_rev = false;
                        ("feed", true)
                    }
                    ('G', 99) if version == 2 => {
                        next.feed_per_rev = true;
                        ("feed", true)
                    }
                    ('G', 96) if version == 2 => {
                        css_word = Some(true);
                        ("spindle_mode", true)
                    }
                    ('G', 97) if version == 2 => {
                        css_word = Some(false);
                        ("spindle_mode", true)
                    }
                    ('G', 50) if version == 2 => {
                        limit_word = true;
                        ("spindle_limit", true)
                    }
                    ('M', 3) => {
                        next.spindle_on = true;
                        next.spindle_direction = SpindleDirection::Cw;
                        ("spindle", true)
                    }
                    ('M', 4) => {
                        next.spindle_on = true;
                        next.spindle_direction = SpindleDirection::Ccw;
                        ("spindle", true)
                    }
                    ('M', 5) => {
                        next.spindle_on = false;
                        ("spindle", true)
                    }
                    ('M', 6) => ("tool_change", true),
                    ('M', 2 | 30) => {
                        next.ended = true;
                        ("end", true)
                    }
                    _ => ("unsupported", false),
                };
                if !supported {
                    return Err(error(
                        "UNSUPPORTED_CODE",
                        format!("{}{} no pertenece a edu-lathe-v1.", word.letter, value),
                    ));
                }
                if !groups.insert(group) {
                    return Err(error(
                        "MODAL_CONFLICT",
                        format!("Más de un código del grupo {group} en el bloque."),
                    ));
                }
            }
            'N' | 'O' => {
                if !word.integer_literal || word.value < 0.0 || word.value.fract() != 0.0 {
                    return Err(error(
                        "INVALID_LABEL",
                        "N/O requieren enteros no negativos.".into(),
                    ));
                }
            }
            'X' => x = Some(word.value),
            'Z' => z = Some(word.value),
            'U' => u = Some(word.value),
            'W' => w = Some(word.value),
            'I' => i = Some(word.value),
            'K' => k = Some(word.value),
            'F' => {
                if word.value <= 0.0 {
                    return Err(error(
                        "INVALID_FEED",
                        "F debe ser positivo en mm/min.".into(),
                    ));
                }
                next.feed_mm_min = Some(word.value);
            }
            'S' => {
                if word.value < 0.0 {
                    return Err(error(
                        "INVALID_SPINDLE",
                        "S debe ser no negativo en RPM.".into(),
                    ));
                }
                s_word = Some((word.value, word.span));
            }
            'T' => {
                if !word.integer_literal
                    || !matches!(word.numeric_width, 1 | 2 | 4)
                    || word.value < 0.0
                    || word.value.fract() != 0.0
                {
                    return Err(error(
                        "INVALID_TOOL_NUMBER",
                        "T requiere 1, 2 o 4 dígitos sin signo (ej. T0101 o T1).".into(),
                    ));
                }
                if word.value > 9999.0 {
                    return Err(error(
                        "INVALID_TOOL_NUMBER",
                        "Número de herramienta fuera de rango (máximo 4 dígitos T9999).".into(),
                    ));
                }
                let raw_val = word.value as u32;
                let four_digits = word.numeric_width == 4;
                let (station, offset) = if four_digits {
                    (raw_val / 100, raw_val % 100)
                } else {
                    (raw_val, raw_val)
                };
                if four_digits && offset != station {
                    return Err(error(
                        "INVALID_TOOL_OFFSET",
                        format!(
                            "El offset {offset:02} no coincide con la estación {station:02}; en este subconjunto usar T{station:02}{station:02} o T{station}."
                        ),
                    ));
                }
                let tool_id = match station {
                    0 => "generic-od",
                    1 => "roughing-od",
                    2 => "finishing-od",
                    3 => "grooving-od",
                    4 => "facing-od",
                    5 if version == 2 => "boring-id",
                    _ => {
                        return Err(error(
                            "UNSUPPORTED_TOOL",
                            format!(
                                "Estación T{station:02} no disponible en la torreta (estaciones 1 a {}, o T0 neutra).",
                                if version == 1 { 4 } else { 5 }
                            ),
                        ));
                    }
                };
                if state.compensation.is_some() {
                    return Err(error(
                        "COMP_TOOL_CHANGE",
                        "Cancelá la compensación con G40 antes de cambiar de herramienta.".into(),
                    ));
                }
                next.tool_id = Some(tool_id.to_string());
            }
            _ => {
                return Err(error(
                    "UNSUPPORTED_WORD",
                    format!("Palabra {} no soportada.", word.letter),
                ));
            }
        }
    }
    let span = words[0].span;
    let has_axes_words = x.is_some() || z.is_some() || u.is_some() || w.is_some();
    resolve_spindle(
        &mut next,
        state,
        s_word,
        css_word,
        limit_word,
        has_axes_words,
        span,
    )?;
    if (x.is_some() && u.is_some()) || (z.is_some() && w.is_some()) {
        return Err(Diagnostic::error(
            "AXIS_CONFLICT",
            span,
            "No combinar X/U ni Z/W en un mismo bloque.",
        ));
    }
    let has_axes = x.is_some() || z.is_some() || u.is_some() || w.is_some();
    if next.ended && has_axes {
        return Err(Diagnostic::error(
            "END_WITH_MOTION",
            span,
            "El bloque de fin no puede incluir ejes.",
        ));
    }
    let motion = if has_axes {
        let mode = next.motion.ok_or_else(|| {
            Diagnostic::error(
                "MISSING_MOTION",
                span,
                "Seleccionar G00/G01/G02/G03 antes de programar ejes.",
            )
        })?;
        let has_arc_words = i.is_some() || k.is_some();
        if mode.is_arc() && (state.compensation.is_some() || next.compensation.is_some()) {
            return Err(Diagnostic::error(
                "COMP_ARC",
                span,
                "Este subconjunto compensa solo tramos G00/G01: cancelá con G40 antes del arco.",
            ));
        }
        if mode.is_arc() {
            if !has_arc_words {
                return Err(Diagnostic::error(
                    "MISSING_ARC_CENTER",
                    span,
                    "G02/G03 requieren I y/o K para definir el centro del arco.",
                ));
            }
        } else if has_arc_words {
            return Err(Diagnostic::error(
                "UNEXPECTED_ARC_WORD",
                span,
                "I/K solo tienen sentido en un bloque G02/G03.",
            ));
        }
        if mode != MotionKind::Rapid && next.feed_mm_min.is_none() {
            return Err(Diagnostic::error(
                "MISSING_FEED",
                span,
                "G01/G02/G03 requieren un F modal positivo en mm/min.",
            ));
        }
        next.position = Position {
            r_mm: x.map_or(state.position.r_mm + u.unwrap_or(0.0) / 2.0, |v| v / 2.0),
            z_mm: z.unwrap_or(state.position.z_mm + w.unwrap_or(0.0)),
        };
        if next.position.r_mm < 0.0
            || ![next.position.r_mm, next.position.z_mm]
                .iter()
                .all(|v| v.is_finite() && v.abs() <= MAX_MAGNITUDE)
        {
            return Err(Diagnostic::error(
                "POSITION_RANGE",
                span,
                "Radio negativo o coordenadas fuera del rango educativo.",
            ));
        }
        let arc = if mode.is_arc() {
            Some(resolve_arc(
                state.position,
                next.position,
                i.unwrap_or(0.0),
                k.unwrap_or(0.0),
                mode,
                span,
            )?)
        } else {
            None
        };
        Some(PlannedMotion { kind: mode, arc })
    } else {
        if i.is_some() || k.is_some() {
            return Err(if next.motion.map(MotionKind::is_arc).unwrap_or(false) {
                Diagnostic::error(
                    "DEGENERATE_ARC",
                    span,
                    "Un arco completo (inicio = fin) no está soportado en torneado exterior.",
                )
            } else {
                Diagnostic::error(
                    "UNEXPECTED_ARC_WORD",
                    span,
                    "I/K solo tienen sentido en un bloque G02/G03 con ejes.",
                )
            });
        }
        None
    };
    if let Some(vc) = next.css_m_min {
        next.spindle_rpm = css_rpm(vc, next.position.r_mm, next.max_rpm.unwrap_or(0.0));
    }
    if motion.as_ref().is_some_and(|m| m.kind != MotionKind::Rapid)
        && next.feed_per_rev
        && (!next.spindle_on || next.spindle_rpm <= 0.0)
    {
        return Err(Diagnostic::error(
            "FEED_PER_REV_SPINDLE",
            span,
            "Con G99 el avance es por vuelta: con el husillo detenido la herramienta no avanzaría. Encendé el husillo (M03/M04 con S).",
        ));
    }
    Ok((next, motion))
}

/// G96 spindle speed for a diameter: n = 1000·Vc / (π·D), limited by G50.
/// At the axis (D = 0) the limit applies.
pub(crate) fn css_rpm(vc_m_min: f64, radius_mm: f64, max_rpm: f64) -> f64 {
    if radius_mm <= 0.0 {
        return max_rpm;
    }
    (1000.0 * vc_m_min / (std::f64::consts::PI * 2.0 * radius_mm)).min(max_rpm)
}

fn resolve_spindle(
    next: &mut State,
    state: &State,
    s_word: Option<(f64, SourceSpan)>,
    css_word: Option<bool>,
    limit_word: bool,
    has_axes: bool,
    span: SourceSpan,
) -> Result<(), Diagnostic> {
    let error =
        |code: &str, at: SourceSpan, message: &str| Err(Diagnostic::error(code, at, message));
    if limit_word {
        if has_axes {
            return error(
                "UNSUPPORTED_CODE",
                span,
                "En este subconjunto G50 solo fija el límite de rpm con S (sin X/Z).",
            );
        }
        match s_word {
            Some((value, _)) if value > 0.0 => next.max_rpm = Some(value),
            _ => {
                return error(
                    "INVALID_SPINDLE",
                    span,
                    "G50 requiere S positivo: el límite de rpm para G96.",
                );
            }
        }
        return Ok(());
    }
    let css = css_word.unwrap_or(state.css_m_min.is_some());
    if css {
        let vc = match s_word {
            Some((value, at)) if value <= 0.0 => {
                return error(
                    "INVALID_SPINDLE",
                    at,
                    "Con G96, S es la velocidad de corte en m/min y debe ser positiva.",
                );
            }
            Some((value, _)) => value,
            None => match state.css_m_min {
                Some(value) => value,
                None => {
                    return error(
                        "INVALID_SPINDLE",
                        span,
                        "G96 requiere S con la velocidad de corte en m/min.",
                    );
                }
            },
        };
        if next.max_rpm.is_none() {
            return error(
                "CSS_NO_LIMIT",
                span,
                "Antes de G96 programá G50 S… (límite de rpm): cerca del eje la velocidad constante dispararía el husillo.",
            );
        }
        next.css_m_min = Some(vc);
    } else {
        next.css_m_min = None;
        if let Some((value, at)) = s_word {
            if value < 0.0 {
                return error("INVALID_SPINDLE", at, "S debe ser no negativo en RPM.");
            }
            next.spindle_rpm = value;
        }
    }
    Ok(())
}

/// Compile atomically: any error suppresses ALL executable blocks and motions.
/// A terminated program's trailing instructions are diagnosed but never run.
pub fn compile(req: &CompileRequest) -> CompileResult {
    compile_version(req, 1)
}

/// Additive interface with an explicit internal point tool T5/T05/T0505.
pub fn compile_v2(req: &CompileRequest) -> CompileResult {
    compile_version(req, 2)
}

fn compile_version(req: &CompileRequest, version: u32) -> CompileResult {
    let mut initial_state = State::initial(req.setup.initial_position);
    if req.setup.tool_id != "generic-od" {
        initial_state.tool_id = Some(req.setup.tool_id.clone());
    }
    let mut result = CompileResult {
        api_version: version,
        dialect: if version == 1 {
            DIALECT
        } else {
            "edu-lathe-v2"
        }
        .into(),
        source_revision: req.source_revision,
        executable: false,
        initial_state: initial_state.clone(),
        blocks: Vec::new(),
        motions: Vec::new(),
        diagnostics: Vec::new(),
        final_state: None,
        estimated_time_s: None,
    };
    let setup_span = SourceSpan {
        line: 1,
        column_start: 1,
        column_end: 1,
    };
    if let Some(message) = setup_error(req, version) {
        // Do not serialize invalid setup floats into a result, even on native callers.
        result.initial_state = State::initial(Position {
            r_mm: 0.0,
            z_mm: 0.0,
        });
        result
            .diagnostics
            .push(Diagnostic::error("INVALID_REQUEST", setup_span, message));
        return result;
    }
    if req.source.len() > MAX_SOURCE_BYTES {
        result.diagnostics.push(Diagnostic::error(
            "SOURCE_LIMIT",
            setup_span,
            "Fuente mayor a 256 KiB.",
        ));
        return result;
    }
    let mut state = initial_state;
    let lines: Vec<&str> = req.source.split('\n').collect();
    let labels = if version == 2 {
        crate::cycles::scan_labels(&lines)
    } else {
        Default::default()
    };
    let mut roughing_depth = None;
    // Profile lines after a G71 are run by G70, not by the main flow.
    let mut skip_through = None;
    for (index, raw) in lines.iter().enumerate() {
        let raw = raw.strip_suffix('\r').unwrap_or(raw);
        let span = line_span(index + 1, raw);
        if raw.trim() == "%" {
            continue;
        }
        if skip_through.is_some_and(|last| index <= last) {
            continue;
        }
        if state.ended {
            if !raw.trim().is_empty() {
                match scan(raw, index + 1) {
                    Ok(words) if words.is_empty() => {}
                    _ => result.diagnostics.push(Diagnostic {
                        code: "AFTER_END".into(),
                        severity: Severity::Warning,
                        span,
                        message: "Bloque posterior al fin de programa: no se ejecuta.".into(),
                    }),
                }
            }
            continue;
        }
        let words = match scan(raw, index + 1) {
            Ok(words) => words,
            Err(diagnostic) => {
                result.diagnostics.push(diagnostic);
                continue;
            }
        };
        if words.is_empty() {
            continue;
        }
        let cycle_code = if version == 2 {
            crate::cycles::cycle_code(&words)
        } else {
            None
        };
        if cycle_code.is_some() && state.compensation.is_some() {
            result.diagnostics.push(Diagnostic::error(
                "COMP_CYCLE",
                span,
                "Cancelá la compensación con G40 antes de un ciclo G70/G71.",
            ));
            continue;
        }
        let step = match cycle_code {
            None => apply(&words, &state, version).map(|(next, planned)| {
                let steps = planned
                    .map(|p| Step {
                        kind: p.kind,
                        to: next.position,
                        arc: p.arc,
                        feed_mm_min: (p.kind != MotionKind::Rapid)
                            .then_some(next.feed_mm_min)
                            .flatten(),
                    })
                    .into_iter()
                    .collect::<Vec<_>>();
                (next, steps, None)
            }),
            Some(code) => (if code == 71 {
                crate::cycles::g71(&words, &state, roughing_depth, &lines, &labels, index)
            } else {
                crate::cycles::g70(&words, &state, &lines, &labels, index)
            })
            .map(|block| match block {
                crate::cycles::CycleBlock::Depth(depth) => {
                    roughing_depth = Some(depth);
                    (state.clone(), Vec::new(), Some(CycleKind::RoughingSetup))
                }
                crate::cycles::CycleBlock::Motions {
                    next,
                    motions,
                    skip_through: skip,
                    cycle,
                } => {
                    skip_through = skip;
                    let steps = motions
                        .into_iter()
                        .map(|m| Step {
                            kind: m.kind,
                            to: m.to,
                            arc: None,
                            feed_mm_min: m.feed_mm_min,
                        })
                        .collect();
                    (next, steps, Some(cycle))
                }
            }),
        };
        let (next, steps, cycle) = match step {
            Ok(value) => value,
            Err(diagnostic) => {
                if cycle_code == Some(71) {
                    skip_through = crate::cycles::g71_profile_end(&words, &labels, index);
                }
                result.diagnostics.push(diagnostic);
                continue;
            }
        };
        if words.iter().all(|word| matches!(word.letter, 'N' | 'O')) {
            continue;
        }
        if result.blocks.len() == MAX_BLOCKS {
            result.diagnostics.push(Diagnostic::error(
                "BLOCK_LIMIT",
                span,
                "Máximo 10.000 bloques ejecutables.",
            ));
            break;
        }
        let id = result.blocks.len();
        let mut motion_ids = Vec::new();
        let has_motion = !steps.is_empty();
        let mut from = state.position;
        for step in steps {
            let motion_id = result.motions.len();
            let length_mm = match step.arc {
                Some(arc) => arc.radius_mm * arc.sweep_rad,
                None => (step.to.r_mm - from.r_mm).hypot(step.to.z_mm - from.z_mm),
            };
            result.motions.push(Motion {
                id: motion_id,
                block_id: id,
                span,
                kind: step.kind,
                from,
                to: step.to,
                arc: step.arc,
                feed_mm_min: step.feed_mm_min,
                tool_id: next
                    .tool_id
                    .clone()
                    .unwrap_or_else(|| req.setup.tool_id.clone()),
                length_mm,
                lead: false,
                feed_mm_rev: None,
                time_s: None,
            });
            motion_ids.push(motion_id);
            from = step.to;
        }
        result.blocks.push(Block {
            id,
            span,
            source: raw.into(),
            before_state: state.clone(),
            after_state: next.clone(),
            motion_ids,
            kind: if next.ended {
                BlockKind::End
            } else if has_motion {
                BlockKind::Motion
            } else {
                BlockKind::State
            },
            cycle,
        });
        state = next;
    }
    result.executable = !result
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error);
    if result.executable {
        result.final_state = Some(state);
    } else {
        result.blocks.clear();
        result.motions.clear();
    }
    if let Some(offsets) = &req.setup.tool_offsets {
        crate::tool_offsets::apply_tool_offsets(&mut result, offsets);
        crate::nose::apply_nose(&mut result, offsets, &req.setup.tool_id);
    }
    if version == 2 {
        crate::timing::estimate_times(&mut result);
    }
    result
}
