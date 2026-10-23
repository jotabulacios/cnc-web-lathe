//! Educational working-angle check (TOOL_WORKING_ANGLE warning).
//!
//! Each catalogue tool gets a nominal insert envelope in the Z/R plane (Z to
//! the right, radius up). A corner `(a, b)` is the wedge occupied by the insert
//! seen from its tip: the minor edge leaves at `a` degrees from +Z and the major
//! edge at `b`, counter-clockwise. A feed direction strictly inside
//! `(a + 180°, b + 180°)` cannot keep the insert on either side of the surface
//! the tip is generating: the trailing flank would cut. The opposite sector
//! `(a, b)` points into the holder side, away from an exterior part, and is
//! treated as a retreat (not checked).
//!
//! Angles are nominal teaching values, not manufacturer data. This is not a
//! collision check of holder, jaws or tailstock; it never certifies a program.
use crate::{CompileResult, Diagnostic, Motion, Severity, Stock};

/// Numerical slack in degrees: a feed exactly on an edge (zero clearance) is
/// accepted. Not a physical clearance.
pub const WORKING_ANGLE_TOLERANCE_DEG: f64 = 1e-6;

/// Samples per forbidden sub-arc when testing contact with the initial stock.
const ARC_SAMPLES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ToolEnvelope {
    pub tool_id: &'static str,
    /// Station and short name for messages, e.g. "T0101 (desbaste 80°)".
    pub label: &'static str,
    /// Insert corners `(minor edge, major edge)` in degrees from +Z.
    pub corners: &'static [(f64, f64)],
}

/// Nominal envelopes. `generic-od` (T0) and `boring-id` (T5) are ideal points
/// and have none. Mirrors the TS catalogue ids in src/lib/lathe/tools.ts.
pub const TOOL_ENVELOPES: [ToolEnvelope; 4] = [
    // Right-hand exterior holder, κr 95° (feed −Z), rhombic 80° insert:
    // major edge at 180 − 95 = 85°, minor edge at 85 − 80 = 5°.
    ToolEnvelope {
        tool_id: "roughing-od",
        label: "T0101 (desbaste 80°)",
        corners: &[(5.0, 85.0)],
    },
    // Right-hand exterior holder, κr 93° (feed −Z), rhombic 55° insert:
    // major edge at 87°, minor edge at 32°.
    ToolEnvelope {
        tool_id: "finishing-od",
        label: "T0202 (acabado 55°)",
        corners: &[(32.0, 87.0)],
    },
    // Facing holder, κr 90° to the radial feed (−X), 80° insert: major edge
    // along +Z (0°), minor edge at 80°.
    ToolEnvelope {
        tool_id: "facing-od",
        label: "T0404 (refrentado 80°)",
        corners: &[(0.0, 80.0)],
    },
    // Grooving blade: front edge along Z, both side flanks with 3° relief.
    // Left corner (0°, 87°), right corner (93°, 180°): radial plunge ±3° or
    // pure axial moves only.
    ToolEnvelope {
        tool_id: "grooving-od",
        label: "T0303 (ranurado)",
        corners: &[(0.0, 87.0), (93.0, 180.0)],
    },
];

pub fn envelope(tool_id: &str) -> Option<&'static ToolEnvelope> {
    TOOL_ENVELOPES.iter().find(|e| e.tool_id == tool_id)
}

/// Open forbidden feed sectors `(from, to)` in degrees, `0 ≤ from < to ≤ 360`.
pub fn forbidden_sectors(envelope: &ToolEnvelope) -> Vec<(f64, f64)> {
    envelope
        .corners
        .iter()
        .map(|&(a, b)| (a + 180.0, b + 180.0))
        .collect()
}

fn normalize_deg(angle: f64) -> f64 {
    let a = angle.rem_euclid(360.0);
    if a >= 360.0 { 0.0 } else { a }
}

fn in_sector(direction: f64, sector: (f64, f64)) -> bool {
    let d = normalize_deg(direction);
    let (lo, hi) = (
        sector.0 + WORKING_ANGLE_TOLERANCE_DEG,
        sector.1 - WORKING_ANGLE_TOLERANCE_DEG,
    );
    (lo < d && d < hi) || (lo < d + 360.0 && d + 360.0 < hi)
}

/// Whether the segment crosses the open initial stock (r < R, −L < z < 0).
/// Material already removed is not tracked: an air move inside the blank counts.
fn segment_engages(from: crate::Position, to: crate::Position, stock: &Stock) -> bool {
    let mut lo: f64 = 0.0;
    let mut hi: f64 = 1.0;
    for (p, d, low, high) in [
        (
            from.r_mm,
            to.r_mm - from.r_mm,
            f64::NEG_INFINITY,
            stock.diameter_mm / 2.0,
        ),
        (from.z_mm, to.z_mm - from.z_mm, -stock.length_mm, 0.0),
    ] {
        if d == 0.0 {
            if !(low < p && p < high) {
                return false;
            }
            continue;
        }
        let (t1, t2) = ((low - p) / d, (high - p) / d);
        lo = lo.max(t1.min(t2));
        hi = hi.min(t1.max(t2));
    }
    lo < hi
}

fn point_in_stock(r: f64, z: f64, stock: &Stock) -> bool {
    r < stock.diameter_mm / 2.0 && -stock.length_mm < z && z < 0.0
}

/// Engaged feed directions (degrees) that fall in a forbidden sector.
fn violations(motion: &Motion, sectors: &[(f64, f64)], stock: &Stock) -> Vec<f64> {
    let (from, to) = (motion.from, motion.to);
    match motion.arc {
        None => {
            let (dr, dz) = (to.r_mm - from.r_mm, to.z_mm - from.z_mm);
            if dr == 0.0 && dz == 0.0 {
                return Vec::new();
            }
            let direction = normalize_deg(dr.atan2(dz).to_degrees());
            if sectors.iter().any(|&s| in_sector(direction, s)) && segment_engages(from, to, stock)
            {
                vec![direction]
            } else {
                Vec::new()
            }
        }
        Some(arc) => {
            // Tangent direction is linear in the sweep fraction s ∈ [0, 1]:
            // φ(s) = θ0 + σ·90° + σ·s·sweep, with σ = +1 for CCW.
            let sigma = if arc.clockwise { -1.0 } else { 1.0 };
            let theta0 = (from.r_mm - arc.center.r_mm).atan2(from.z_mm - arc.center.z_mm);
            let sweep_deg = arc.sweep_rad.to_degrees();
            let phi0 = theta0.to_degrees() + sigma * 90.0;
            let mut found = Vec::new();
            for &(f1, f2) in sectors {
                for k in -3..=3 {
                    let shift = 360.0 * f64::from(k);
                    let lo_phi = f1 + shift + WORKING_ANGLE_TOLERANCE_DEG;
                    let hi_phi = f2 + shift - WORKING_ANGLE_TOLERANCE_DEG;
                    let s1 = (lo_phi - phi0) / (sigma * sweep_deg);
                    let s2 = (hi_phi - phi0) / (sigma * sweep_deg);
                    let (s_lo, s_hi) = (s1.min(s2).max(0.0), s1.max(s2).min(1.0));
                    if s_lo >= s_hi {
                        continue;
                    }
                    for i in 0..ARC_SAMPLES {
                        let s = s_lo + (s_hi - s_lo) * (i as f64 + 0.5) / ARC_SAMPLES as f64;
                        let theta = theta0 + sigma * s * arc.sweep_rad;
                        let r = arc.center.r_mm + arc.radius_mm * theta.sin();
                        let z = arc.center.z_mm + arc.radius_mm * theta.cos();
                        if point_in_stock(r, z, stock) {
                            found.push(normalize_deg(phi0 + sigma * s * sweep_deg));
                        }
                    }
                }
            }
            found
        }
    }
}

/// Angle from the nearest Z direction for a feed that lowers the radius.
fn descent_from_z(direction: f64) -> f64 {
    if direction <= 270.0 {
        direction - 180.0
    } else {
        360.0 - direction
    }
}

fn fmt_deg(value: f64) -> String {
    format!("{value:.1}").replace('.', ",")
}

fn message(envelope: &ToolEnvelope, directions: &[f64], is_arc: bool) -> String {
    let sector = forbidden_sectors(envelope)
        .into_iter()
        .find(|&s| in_sector(directions[0], s))
        .unwrap_or((180.0, 270.0));
    let toward_chuck = sector.1 <= 270.0 + WORKING_ANGLE_TOLERANCE_DEG;
    let (free_low, free_high) = if toward_chuck {
        (sector.0 - 180.0, sector.1 - 180.0)
    } else {
        (360.0 - sector.1, 360.0 - sector.0)
    };
    let (min, max) = directions
        .iter()
        .map(|&d| descent_from_z(d))
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), a| {
            (lo.min(a), hi.max(a))
        });
    let angle = if is_arc && max - min > 0.05 {
        format!("entre {}° y {}°", fmt_deg(min), fmt_deg(max))
    } else {
        format!("a {}°", fmt_deg(min))
    };
    let movement = if is_arc {
        "en parte de este arco la tangente baja el diámetro"
    } else {
        "este avance baja el diámetro"
    };
    let (axis, fix) = if toward_chuck {
        (
            "va hacia el plato (−Z)",
            "Cortá hacia el plato con el diámetro creciendo, invertí el sentido del perfil o usá otra herramienta.",
        )
    } else {
        (
            "se aleja del plato (+Z)",
            "Entrá en forma radial y retirá antes de desplazarte, o usá otra herramienta.",
        )
    };
    format!(
        "Ángulo de trabajo con {}: {movement} mientras {axis}, {angle} del eje Z. El inserto nominal solo admite hasta {}° o más de {}° en esa dirección: cortaría con el flanco trasero y el cuerpo de la herramienta rozaría la pieza. {fix} Aviso educativo: el programa se puede ejecutar igual.",
        envelope.label,
        fmt_deg(free_low),
        fmt_deg(free_high),
    )
}

/// One warning per block whose feed motions cut outside the tool envelope while
/// crossing the initial stock. Rapids and ideal tools are not checked.
pub(crate) fn check(result: &CompileResult, stock: &Stock) -> Vec<Diagnostic> {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    let mut warned_block = None;
    for motion in &result.motions {
        if motion.kind == crate::MotionKind::Rapid || warned_block == Some(motion.block_id) {
            continue;
        }
        let Some(envelope) = envelope(&motion.tool_id) else {
            continue;
        };
        let directions = violations(motion, &forbidden_sectors(envelope), stock);
        if directions.is_empty() {
            continue;
        }
        warned_block = Some(motion.block_id);
        diagnostics.push(Diagnostic {
            code: "TOOL_WORKING_ANGLE".into(),
            severity: Severity::Warning,
            span: motion.span,
            message: message(envelope, &directions, motion.arc.is_some()),
        });
    }
    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sectors_follow_the_insert_corners() {
        assert_eq!(
            forbidden_sectors(envelope("roughing-od").unwrap()),
            vec![(185.0, 265.0)]
        );
        assert_eq!(
            forbidden_sectors(envelope("finishing-od").unwrap()),
            vec![(212.0, 267.0)]
        );
        assert_eq!(
            forbidden_sectors(envelope("facing-od").unwrap()),
            vec![(180.0, 260.0)]
        );
        assert_eq!(
            forbidden_sectors(envelope("grooving-od").unwrap()),
            vec![(180.0, 267.0), (273.0, 360.0)]
        );
        assert!(envelope("generic-od").is_none());
        assert!(envelope("boring-id").is_none());
    }

    #[test]
    fn exact_edges_are_accepted() {
        let grooving = forbidden_sectors(envelope("grooving-od").unwrap());
        for direction in [0.0, 180.0, 267.0, 270.0, 273.0, 360.0] {
            assert!(
                !grooving.iter().any(|&s| in_sector(direction, s)),
                "{direction}"
            );
        }
        assert!(in_sector(181.0, grooving[0]));
        assert!(in_sector(359.0, grooving[1]));
        assert!(in_sector(-1.0, grooving[1]));
    }

    #[test]
    fn air_segments_do_not_engage() {
        let stock = Stock {
            diameter_mm: 50.0,
            length_mm: 100.0,
        };
        let p = |r_mm, z_mm| crate::Position { r_mm, z_mm };
        assert!(!segment_engages(p(27.0, 2.0), p(15.0, 0.0), &stock));
        assert!(!segment_engages(p(30.0, -10.0), p(25.0, -20.0), &stock));
        assert!(segment_engages(p(20.0, 0.0), p(10.0, -60.0), &stock));
        assert!(segment_engages(p(27.0, 1.0), p(20.0, -3.0), &stock));
    }
}
