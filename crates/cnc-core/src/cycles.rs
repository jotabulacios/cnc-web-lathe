//! Educational G71/G70 subset (edu-lathe-v2), two-block Fanuc-style format:
//!
//! ```text
//! G71 U<Δd radial depth> R<e retract>
//! G71 P<ns> Q<nf> U<Δu X allowance, diameter> W<Δw Z allowance> [F<feed>]
//! N<ns> G00/G01 X…   (first profile block: X only)
//! …                  (G00/G01, Z never increasing, X never decreasing)
//! N<nf> …
//! G70 P<ns> Q<nf>
//! ```
//!
//! Type I exterior roughing only. Cycles expand here into ordinary rapid/linear
//! motions of ONE block, so material reconstruction, offsets and views consume
//! them unchanged. Not a controller emulation: retract and pass order are a
//! documented educational model.
use std::collections::HashMap;

use crate::syntax::{Word, scan};
use crate::*;

/// Maximum motions one cycle block may expand to.
pub const MAX_CYCLE_MOTIONS: usize = 4096;
/// Smallest accepted radial depth per pass, in mm.
pub const MIN_CYCLE_DEPTH_MM: f64 = 0.01;
/// On sloped profile segments a pass stops this far (Z) before the contour, so the
/// contour pass crosses each step transversally instead of grazing an interpolated
/// corner a few ulps off its line. The contour removes it: the shape is unchanged.
pub const CYCLE_PASS_CLEARANCE_MM: f64 = 0.001;

#[derive(Clone, Copy, Debug)]
pub(crate) struct RoughingDepth {
    depth_mm: f64,
    retract_mm: f64,
}

pub(crate) struct CycleMotion {
    pub kind: MotionKind,
    pub to: Position,
    pub feed_mm_min: Option<f64>,
}

pub(crate) enum CycleBlock {
    /// First G71 block: parameters only, no motion.
    Depth(RoughingDepth),
    /// Expanded cycle. `skip_through` is the last profile line index (G71 only).
    Motions {
        next: State,
        motions: Vec<CycleMotion>,
        skip_through: Option<usize>,
        cycle: CycleKind,
    },
}

/// Returns the cycle G code of a block, if any (only integer G70/G71).
pub(crate) fn cycle_code(words: &[Word]) -> Option<u32> {
    words
        .iter()
        .find(|w| w.letter == 'G' && w.integer_literal && matches!(w.value, 70.0 | 71.0))
        .map(|w| w.value as u32)
}

/// N labels by line index. Lines that fail to scan are diagnosed by the main pass.
pub(crate) fn scan_labels(lines: &[&str]) -> HashMap<u32, Vec<usize>> {
    let mut labels: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, raw) in lines.iter().enumerate() {
        if let Ok(words) = scan(raw.strip_suffix('\r').unwrap_or(raw), index + 1)
            && let Some(first) = words.first()
            && first.letter == 'N'
            && first.integer_literal
        {
            labels.entry(first.value as u32).or_default().push(index);
        }
    }
    labels
}

struct CycleWords {
    span: SourceSpan,
    values: HashMap<char, (f64, bool, SourceSpan)>,
}

fn read_words(words: &[Word], code: u32) -> Result<CycleWords, Diagnostic> {
    let mut values = HashMap::new();
    for word in words {
        let error = |message: String| Diagnostic::error("CYCLE_WORD", word.span, message);
        match word.letter {
            'G' if word.integer_literal && word.value == code as f64 => {}
            'G' | 'M' => {
                return Err(error(format!(
                    "G{code} va solo en su bloque: no combinar con {}{}.",
                    word.letter, word.value
                )));
            }
            'N' | 'P' | 'Q' | 'U' | 'W' | 'R' | 'F' => {
                if values
                    .insert(word.letter, (word.value, word.integer_literal, word.span))
                    .is_some()
                {
                    return Err(Diagnostic::error(
                        "DUPLICATE_WORD",
                        word.span,
                        format!("Palabra {} repetida.", word.letter),
                    ));
                }
            }
            _ => {
                return Err(error(format!(
                    "La palabra {} no pertenece a G{code} (usar U R, o P Q U W F).",
                    word.letter
                )));
            }
        }
    }
    Ok(CycleWords {
        span: words[0].span,
        values,
    })
}

impl CycleWords {
    fn number(&self, letter: char) -> Option<f64> {
        self.values.get(&letter).map(|v| v.0)
    }
    fn label(&self, letter: char) -> Result<u32, Diagnostic> {
        match self.values.get(&letter) {
            Some((value, true, _)) if *value <= u32::MAX as f64 => Ok(*value as u32),
            Some((_, _, span)) => Err(Diagnostic::error(
                "CYCLE_WORD",
                *span,
                format!("{letter} debe ser un número de bloque N entero."),
            )),
            None => Err(Diagnostic::error(
                "CYCLE_WORD",
                self.span,
                format!("Falta {letter} (primer y último bloque N del perfil)."),
            )),
        }
    }
    fn only(&self, allowed: &[char], message: &str) -> Result<(), Diagnostic> {
        match self
            .values
            .iter()
            .find(|(letter, _)| !allowed.contains(letter))
        {
            Some((_, (_, _, span))) => Err(Diagnostic::error("CYCLE_WORD", *span, message)),
            None => Ok(()),
        }
    }
}

struct ProfilePoint {
    kind: MotionKind,
    to: Position,
    feed_mm_min: Option<f64>,
}

/// Resolve the profile lines ns..=nf from `start` with the normal block rules.
/// Only G00/G01 axis and F words are accepted inside a profile.
fn profile(
    lines: &[&str],
    labels: &HashMap<u32, Vec<usize>>,
    ns: u32,
    nf: u32,
    start: &State,
    span: SourceSpan,
    placement: Placement,
) -> Result<(usize, usize, Vec<ProfilePoint>), Diagnostic> {
    let find = |label: u32| match labels.get(&label).map(Vec::as_slice) {
        Some([index]) => Ok(*index),
        Some(_) => Err(Diagnostic::error(
            "CYCLE_PROFILE",
            span,
            format!("El bloque N{label} está repetido: el perfil sería ambiguo."),
        )),
        None => Err(Diagnostic::error(
            "CYCLE_PROFILE",
            span,
            format!("No existe el bloque N{label} del perfil."),
        )),
    };
    let (first, last) = (find(ns)?, find(nf)?);
    if last < first {
        return Err(Diagnostic::error(
            "CYCLE_PROFILE",
            span,
            "Q debe ser un bloque N posterior o igual a P.",
        ));
    }
    // Checked before resolving lines so the order error is the one reported.
    match placement {
        Placement::AfterLine(line) if first <= line => {
            return Err(Diagnostic::error(
                "CYCLE_PROFILE",
                span,
                "El perfil N P…Q debe escribirse después del bloque G71.",
            ));
        }
        // A later profile not skipped by a G71 would also run in the main flow.
        Placement::BeforeLine(line) if last >= line => {
            return Err(Diagnostic::error(
                "CYCLE_PROFILE",
                span,
                "G70 debe escribirse después de su perfil N P…Q (normalmente tras el G71).",
            ));
        }
        _ => {}
    }
    let mut state = start.clone();
    let mut points = Vec::new();
    for (offset, raw) in lines[first..=last].iter().enumerate() {
        let line = first + offset + 1;
        let raw = raw.strip_suffix('\r').unwrap_or(raw);
        if raw.trim() == "%" {
            continue;
        }
        let words = scan(raw, line)?;
        if words.is_empty() {
            continue;
        }
        if let Some(word) = words.iter().find(|w| {
            !matches!(w.letter, 'N' | 'G' | 'X' | 'Z' | 'U' | 'W' | 'F')
                || (w.letter == 'G' && !(w.integer_literal && matches!(w.value, 0.0 | 1.0)))
        }) {
            return Err(Diagnostic::error(
                "CYCLE_PROFILE",
                word.span,
                "En un perfil de ciclo solo se admiten G00/G01, X/Z/U/W y F (sin arcos, T, S ni M).",
            ));
        }
        let (next, planned) = crate::interpreter::apply(&words, &state, 2)?;
        if let Some(planned) = planned {
            points.push(ProfilePoint {
                kind: planned.kind,
                to: next.position,
                feed_mm_min: (planned.kind != MotionKind::Rapid)
                    .then_some(next.feed_mm_min)
                    .flatten(),
            });
        }
        state = next;
    }
    Ok((first, last, points))
}

#[derive(Clone, Copy)]
enum Placement {
    AfterLine(usize),
    BeforeLine(usize),
}

/// Last profile line named by a G71 P…Q block, so the main flow can skip the
/// profile even when the cycle itself failed (no duplicated diagnostics).
pub(crate) fn g71_profile_end(
    words: &[Word],
    labels: &HashMap<u32, Vec<usize>>,
    line_index: usize,
) -> Option<usize> {
    let q = words
        .iter()
        .find(|w| w.letter == 'Q' && w.integer_literal)?;
    match labels.get(&(q.value as u32)).map(Vec::as_slice) {
        Some([index]) if *index > line_index => Some(*index),
        _ => None,
    }
}

/// First G71 block (U R) or the second (P Q U W F) using the stored depth.
pub(crate) fn g71(
    words: &[Word],
    state: &State,
    pending: Option<RoughingDepth>,
    lines: &[&str],
    labels: &HashMap<u32, Vec<usize>>,
    line_index: usize,
) -> Result<CycleBlock, Diagnostic> {
    let w = read_words(words, 71)?;
    let positive = |letter: char, what: &str| match w.number(letter) {
        Some(v) if v > 0.0 => Ok(v),
        _ => Err(Diagnostic::error(
            "CYCLE_WORD",
            w.span,
            format!("{letter} ({what}) debe ser positivo."),
        )),
    };
    if !w.values.contains_key(&'P') {
        w.only(
            &['N', 'U', 'R'],
            "El primer bloque G71 lleva solo U (profundidad) y R (retracción).",
        )?;
        let depth_mm = positive('U', "profundidad de pasada en radio")?;
        if depth_mm < MIN_CYCLE_DEPTH_MM {
            return Err(Diagnostic::error(
                "CYCLE_WORD",
                w.span,
                "U debe ser al menos 0,01 mm por pasada.",
            ));
        }
        let retract_mm = positive('R', "retracción")?;
        return Ok(CycleBlock::Depth(RoughingDepth {
            depth_mm,
            retract_mm,
        }));
    }
    w.only(
        &['N', 'P', 'Q', 'U', 'W', 'F'],
        "El segundo bloque G71 lleva P Q U W y opcionalmente F.",
    )?;
    let depth = pending.ok_or_else(|| {
        Diagnostic::error(
            "CYCLE_SEQUENCE",
            w.span,
            "Falta el bloque previo G71 U… R… con profundidad y retracción.",
        )
    })?;
    let allowance_x = w.number('U').unwrap_or(0.0);
    let allowance_z = w.number('W').unwrap_or(0.0);
    if allowance_x < 0.0 || allowance_z < 0.0 {
        return Err(Diagnostic::error(
            "CYCLE_WORD",
            w.span,
            "Este subconjunto solo admite sobremedidas U/W no negativas (desbaste exterior).",
        ));
    }
    let mut next = state.clone();
    if let Some(feed) = w.number('F') {
        if feed <= 0.0 {
            return Err(Diagnostic::error(
                "INVALID_FEED",
                w.span,
                "F debe ser positivo en mm/min.",
            ));
        }
        next.feed_mm_min = Some(feed);
    }
    let feed = next.feed_mm_min.ok_or_else(|| {
        Diagnostic::error("MISSING_FEED", w.span, "G71 requiere un F de desbaste.")
    })?;
    let (ns, nf) = (w.label('P')?, w.label('Q')?);
    // The G71 line's own F is modal for resolving the profile, like any block.
    let (_, last, points) = profile(
        lines,
        labels,
        ns,
        nf,
        &next,
        w.span,
        Placement::AfterLine(line_index),
    )?;
    let start = state.position;
    let shape = validate_type_one(&points, start, w.span)?;
    let shifted: Vec<Position> = shape
        .iter()
        .map(|p| Position {
            r_mm: p.r_mm + allowance_x / 2.0,
            z_mm: p.z_mm + allowance_z,
        })
        .collect();
    let outer = shifted.last().unwrap().r_mm;
    if start.r_mm < outer {
        return Err(Diagnostic::error(
            "CYCLE_PROFILE",
            w.span,
            "El punto de inicio del ciclo debe estar por fuera del perfil más la sobremedida.",
        ));
    }
    let mut motions = Vec::new();
    let mut push = |kind, to, feed_mm_min| -> Result<(), Diagnostic> {
        if motions.len() == MAX_CYCLE_MOTIONS {
            return Err(Diagnostic::error(
                "CYCLE_LIMIT",
                w.span,
                "El ciclo generaría más de 4096 movimientos: aumentá U o acercá el inicio.",
            ));
        }
        motions.push(CycleMotion {
            kind,
            to,
            feed_mm_min,
        });
        Ok(())
    };
    let inner = shifted[0].r_mm;
    // Bound the level count itself: levels that cut nothing push no motion.
    if (start.r_mm - inner) / depth.depth_mm > MAX_CYCLE_MOTIONS as f64 {
        return Err(Diagnostic::error(
            "CYCLE_LIMIT",
            w.span,
            "El ciclo tendría más de 4096 niveles: aumentá U o acercá el inicio al perfil.",
        ));
    }
    let mut level = 1usize;
    loop {
        let r = start.r_mm - level as f64 * depth.depth_mm;
        if r <= inner {
            break;
        }
        let z = z_at_radius(&shifted, r);
        if z < start.z_mm {
            let back = Position {
                r_mm: r + depth.retract_mm,
                z_mm: (z + depth.retract_mm).min(start.z_mm),
            };
            push(
                MotionKind::Rapid,
                Position {
                    r_mm: r,
                    z_mm: start.z_mm,
                },
                None,
            )?;
            push(
                MotionKind::Linear,
                Position { r_mm: r, z_mm: z },
                Some(feed),
            )?;
            push(MotionKind::Rapid, back, None)?;
            push(
                MotionKind::Rapid,
                Position {
                    r_mm: back.r_mm,
                    z_mm: start.z_mm,
                },
                None,
            )?;
        }
        level += 1;
    }
    // Semi-finishing contour along the profile plus allowance, then back to start.
    // A' with allowance may sit Δw above the start Z: reach it in air first.
    push(
        MotionKind::Rapid,
        Position {
            r_mm: inner,
            z_mm: start.z_mm,
        },
        None,
    )?;
    push(MotionKind::Rapid, shifted[0], None)?;
    for point in &shifted[1..] {
        push(MotionKind::Linear, *point, Some(feed))?;
    }
    push(
        MotionKind::Rapid,
        Position {
            r_mm: start.r_mm,
            z_mm: shifted.last().unwrap().z_mm,
        },
        None,
    )?;
    push(MotionKind::Rapid, start, None)?;
    Ok(CycleBlock::Motions {
        next,
        motions: dedupe(motions, start),
        skip_through: Some(last),
        cycle: CycleKind::Roughing,
    })
}

/// G70 P Q: run the profile blocks from the current point, then return to it.
pub(crate) fn g70(
    words: &[Word],
    state: &State,
    lines: &[&str],
    labels: &HashMap<u32, Vec<usize>>,
    line_index: usize,
) -> Result<CycleBlock, Diagnostic> {
    let w = read_words(words, 70)?;
    w.only(&['N', 'P', 'Q'], "G70 lleva solo P y Q.")?;
    let (ns, nf) = (w.label('P')?, w.label('Q')?);
    let (_, _, points) = profile(
        lines,
        labels,
        ns,
        nf,
        state,
        w.span,
        Placement::BeforeLine(line_index),
    )?;
    let start = state.position;
    validate_type_one(&points, start, w.span)?;
    if points
        .iter()
        .any(|p| p.kind == MotionKind::Linear && p.feed_mm_min.is_none())
    {
        return Err(Diagnostic::error(
            "MISSING_FEED",
            w.span,
            "El perfil necesita un F modal para el acabado G70.",
        ));
    }
    let mut motions: Vec<CycleMotion> = points
        .iter()
        .map(|p| CycleMotion {
            kind: p.kind,
            to: p.to,
            feed_mm_min: p.feed_mm_min,
        })
        .collect();
    let end = motions.last().map_or(start, |m| m.to);
    motions.push(CycleMotion {
        kind: MotionKind::Rapid,
        to: Position {
            r_mm: start.r_mm.max(end.r_mm),
            z_mm: end.z_mm,
        },
        feed_mm_min: None,
    });
    motions.push(CycleMotion {
        kind: MotionKind::Rapid,
        to: start,
        feed_mm_min: None,
    });
    Ok(CycleBlock::Motions {
        next: state.clone(),
        motions: dedupe(motions, start),
        skip_through: None,
        cycle: CycleKind::Finishing,
    })
}

/// Type I exterior shape: first block moves X only; then Z never increases and
/// the radius never decreases. Returns the profile points from A' onward.
fn validate_type_one(
    points: &[ProfilePoint],
    start: Position,
    span: SourceSpan,
) -> Result<Vec<Position>, Diagnostic> {
    let error = |message: &str| Err(Diagnostic::error("CYCLE_PROFILE", span, message));
    let Some(first) = points.first() else {
        return error("El perfil no tiene movimientos.");
    };
    if first.to.z_mm != start.z_mm {
        return error(
            "El primer bloque del perfil debe mover solo X (tipo I): Z igual al punto de inicio.",
        );
    }
    if points.len() < 2 {
        return error("El perfil necesita al menos un tramo después del primer bloque.");
    }
    let shape: Vec<Position> = points.iter().map(|p| p.to).collect();
    for pair in shape.windows(2) {
        if pair[1].z_mm > pair[0].z_mm || pair[1].r_mm < pair[0].r_mm {
            return error(
                "Perfil no monótono: en este subconjunto Z no puede aumentar ni X disminuir (G71 tipo I exterior).",
            );
        }
    }
    if shape[0].r_mm > start.r_mm {
        return error("El perfil empieza por fuera del punto de inicio del ciclo.");
    }
    Ok(shape)
}

/// Where a pass at radius `r` stops: the first Z where the monotone profile
/// reaches `r`; beyond its end, the end Z. Vertices and radial shoulders are exact
/// (stored equality is contact); interpolated points keep the pass clearance.
fn z_at_radius(shape: &[Position], r: f64) -> f64 {
    for pair in shape.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if a.r_mm < r && r <= b.r_mm {
            if r == b.r_mm || a.z_mm == b.z_mm {
                return b.z_mm;
            }
            let t = (r - a.r_mm) / (b.r_mm - a.r_mm);
            return (a.z_mm + t * (b.z_mm - a.z_mm) + CYCLE_PASS_CLEARANCE_MM).min(a.z_mm);
        }
    }
    shape.last().unwrap().z_mm
}

/// Drop zero-length moves so no motion repeats its start point.
fn dedupe(motions: Vec<CycleMotion>, start: Position) -> Vec<CycleMotion> {
    let mut at = start;
    motions
        .into_iter()
        .filter(|m| {
            let keep = m.to != at;
            at = m.to;
            keep
        })
        .collect()
}
