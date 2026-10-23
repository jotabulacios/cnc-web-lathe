use cnc_core::*;
use std::f64::consts::PI;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 11,
        source: source.into(),
        setup: Setup {
            x_convention: "diameter".into(),
            initial_position: Position {
                r_mm: 30.0,
                z_mm: 5.0,
            },
            stock: Stock {
                diameter_mm: 50.0,
                length_mm: 100.0,
            },
            tool_id: "generic-od".into(),
            tool_offsets: None,
        },
    }
}

const PROGRAM: &str = "G21 G18 G98
T0101
S900 M03
G00 X52 Z2
G71 U2 R1
G71 P10 Q50 U0.4 W0.1 F150
N10 G00 X20
N20 G01 Z-10 F80
N30 X30 Z-20
N40 Z-35
N50 X50 Z-40
G70 P10 Q50
G00 X60 Z5
M05
M30";

fn p(r_mm: f64, z_mm: f64) -> Position {
    Position { r_mm, z_mm }
}

fn exterior_volume(profile: &StockProfileV2) -> f64 {
    profile
        .spans
        .iter()
        .map(|s| {
            PI * (s.z_end_mm - s.z_start_mm)
                * (s.r_start_mm.powi(2) + s.r_start_mm * s.r_end_mm + s.r_end_mm.powi(2))
                / 3.0
        })
        .sum()
}

/// Volume of a monotone exterior shape (list of (r, z) points, decreasing z) clipped
/// to the stock radius and to z ≤ 0, with full stock beyond its last point.
fn frustum(len: f64, a: f64, b: f64) -> f64 {
    PI * len * (a * a + a * b + b * b) / 3.0
}

fn profile_at(source: &str, cursor: usize) -> StockProfileV2 {
    match lab_profile_at(&request(source), 0.0, cursor) {
        LabProfile::Exterior(profile) => profile,
        LabProfile::Annular(_) => panic!("solid without T5 is exterior"),
    }
}

#[test]
fn g71_expands_level_passes_and_a_contour_with_allowance_in_one_block() {
    let program = compile_v2(&request(PROGRAM));
    assert!(program.executable, "{:?}", program.diagnostics);
    // Profile lines are not blocks of the main flow.
    let sources: Vec<&str> = program.blocks.iter().map(|b| b.source.as_str()).collect();
    assert_eq!(sources.len(), 10);
    assert!(!sources.iter().any(|s| s.starts_with('N')));
    assert_eq!(program.blocks[4].cycle, Some(CycleKind::RoughingSetup));
    assert!(program.blocks[4].motion_ids.is_empty());
    let roughing = &program.blocks[5];
    assert_eq!(roughing.cycle, Some(CycleKind::Roughing));
    assert_eq!(
        roughing.after_state.position,
        p(26.0, 2.0),
        "returns to the start point"
    );
    let motions: Vec<&Motion> = roughing
        .motion_ids
        .iter()
        .map(|&i| &program.motions[i])
        .collect();
    // Seven levels (R24…R12, ΔR 2) × 4 moves, 2 rapids to A' (+allowance),
    // 4 contour cuts and 2 returns.
    assert_eq!(motions.len(), 7 * 4 + 8);
    let cuts: Vec<(f64, f64)> = motions[..28]
        .iter()
        .filter(|m| m.kind == MotionKind::Linear && m.from.r_mm == m.to.r_mm && m.from.z_mm == 2.0)
        .map(|m| (m.to.r_mm, m.to.z_mm))
        .collect();
    let radii: Vec<f64> = cuts.iter().map(|c| c.0).collect();
    assert_eq!(radii, vec![24.0, 22.0, 20.0, 18.0, 16.0, 14.0, 12.0]);
    // Hand oracle: R14 meets the shifted cone (10.2,−9.9)→(15.2,−19.9) at t=0.76,
    // Z−17.5; the pass stops CYCLE_PASS_CLEARANCE_MM before it.
    let (_, z14) = cuts[5];
    assert!((z14 - (-17.5 + CYCLE_PASS_CLEARANCE_MM)).abs() < 1e-12);
    for pair in motions.windows(2) {
        assert_eq!(pair[0].to, pair[1].from, "continuous path");
    }
    assert!(
        motions
            .iter()
            .all(|m| m.kind == MotionKind::Rapid || m.feed_mm_min == Some(150.0))
    );
    // Contour along the profile plus U0.4 (radius +0.2) and W0.1.
    let contour: Vec<Position> = motions[28..].iter().map(|m| m.to).collect();
    let expected = [
        p(10.2, 2.0),
        p(10.2, 2.1),
        p(10.2, -9.9),
        p(15.2, -19.9),
        p(15.2, -34.9),
        p(25.2, -39.9),
        p(26.0, -39.9),
        p(26.0, 2.0),
    ];
    for (a, e) in contour.iter().zip(expected) {
        assert!(
            (a.r_mm - e.r_mm).abs() < 1e-12 && (a.z_mm - e.z_mm).abs() < 1e-12,
            "{a:?} != {e:?}"
        );
    }
}

#[test]
fn material_after_g71_is_the_allowance_shape_and_after_g70_the_exact_profile() {
    let rough = profile_at(PROGRAM, 6);
    assert!(rough.complete, "{:?}", rough.diagnostics);
    // Shifted shape clipped by the Ø50 stock: the last cone reaches R25 at Z−39.8.
    let expected = PI * 10.2 * 10.2 * 9.9
        + frustum(10.0, 10.2, 15.2)
        + PI * 15.2 * 15.2 * 15.0
        + frustum(4.9, 15.2, 25.0)
        + PI * 625.0 * 60.2;
    assert!((exterior_volume(&rough) - expected).abs() < expected * 1e-9);
    let finished = profile_at(PROGRAM, 7);
    assert!(finished.complete, "{:?}", finished.diagnostics);
    assert!((exterior_volume(&finished) - 45500.0 * PI).abs() < 45500.0 * PI * 1e-12);
    let end = profile_at(PROGRAM, 10);
    assert!(end.complete);
    assert!((exterior_volume(&end) - 45500.0 * PI).abs() < 45500.0 * PI * 1e-12);
}

#[test]
fn g70_runs_the_profile_with_its_own_feed_and_returns_to_the_start_point() {
    let program = compile_v2(&request(PROGRAM));
    let finishing = &program.blocks[6];
    assert_eq!(finishing.cycle, Some(CycleKind::Finishing));
    let motions: Vec<&Motion> = finishing
        .motion_ids
        .iter()
        .map(|&i| &program.motions[i])
        .collect();
    let path: Vec<(MotionKind, Position, Option<f64>)> = motions
        .iter()
        .map(|m| (m.kind, m.to, m.feed_mm_min))
        .collect();
    assert_eq!(
        path,
        vec![
            (MotionKind::Rapid, p(10.0, 2.0), None),
            (MotionKind::Linear, p(10.0, -10.0), Some(80.0)),
            (MotionKind::Linear, p(15.0, -20.0), Some(80.0)),
            (MotionKind::Linear, p(15.0, -35.0), Some(80.0)),
            (MotionKind::Linear, p(25.0, -40.0), Some(80.0)),
            (MotionKind::Rapid, p(26.0, -40.0), None),
            (MotionKind::Rapid, p(26.0, 2.0), None),
        ]
    );
    assert_eq!(
        finishing.after_state.feed_mm_min,
        Some(150.0),
        "G70 keeps the modal feed"
    );
}

#[test]
fn tool_offsets_apply_to_expanded_cycle_motions() {
    let mut req = request(PROGRAM);
    req.setup.tool_offsets = Some(vec![ToolOffset {
        tool_id: "roughing-od".into(),
        calibration_error_x_mm: 0.0,
        calibration_error_z_mm: 0.0,
        wear_x_mm: 0.2,
        wear_z_mm: 0.0,
        nose_radius_mm: 0.0,
    }]);
    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, 7) else {
        panic!("exterior");
    };
    assert!(profile.complete, "{:?}", profile.diagnostics);
    // Every finished radius grows by 0.1 (wear X +0.2 in diameter); the last cone
    // to R25.1 is clipped by the R25 stock at t=0.99, i.e. Z−39.95.
    let expected = PI * 10.1 * 10.1 * 10.0
        + frustum(10.0, 10.1, 15.1)
        + PI * 15.1 * 15.1 * 15.0
        + frustum(4.95, 15.1, 25.0)
        + PI * 625.0 * 60.05;
    assert!((exterior_volume(&profile) - expected).abs() < expected * 1e-9);
}

#[test]
fn cycle_errors_are_explicit_and_atomic() {
    let cases = [
        (PROGRAM.replace("G71 U2 R1\n", ""), "CYCLE_SEQUENCE"),
        (PROGRAM.replace("N40 Z-35", "N40 Z-5"), "CYCLE_PROFILE"),
        (
            PROGRAM.replace("N30 X30 Z-20", "N30 X10 Z-20"),
            "CYCLE_PROFILE",
        ),
        (
            PROGRAM.replace("N30 X30 Z-20", "N30 G03 X30 Z-20 I5 K0"),
            "CYCLE_PROFILE",
        ),
        (
            PROGRAM.replace("N10 G00 X20", "N10 G00 X20 Z1"),
            "CYCLE_PROFILE",
        ),
        (PROGRAM.replace("Q50 U0.4", "Q60 U0.4"), "CYCLE_PROFILE"),
        (
            PROGRAM.replace("N20 G01 Z-10 F80", "N20 G01 Z-10 F80 M08"),
            "CYCLE_PROFILE",
        ),
        (
            PROGRAM.replace("G71 U2 R1", "G71 U2 R1 T0101"),
            "CYCLE_WORD",
        ),
        (PROGRAM.replace("G71 U2 R1", "G71 U0 R1"), "CYCLE_WORD"),
        (PROGRAM.replace("G71 U2 R1", "G71 U0.005 R1"), "CYCLE_WORD"),
        (PROGRAM.replace("G00 X52 Z2", "G00 X40 Z2"), "CYCLE_PROFILE"),
        (PROGRAM.replace("G71 U2 R1", "G71 U0.01 R1"), "CYCLE_LIMIT"),
        (
            PROGRAM.replace("N50 X50 Z-40", "N50 X50 Z-40\nN50 X50"),
            "CYCLE_PROFILE",
        ),
    ];
    for (source, code) in cases {
        let result = compile_v2(&request(&source));
        assert!(!result.executable, "{code}: {source}");
        assert!(result.motions.is_empty() && result.blocks.is_empty());
        assert!(
            result.diagnostics.iter().any(|d| d.code == code),
            "{code}: {:?}",
            result.diagnostics
        );
    }
    // The historical dialect keeps rejecting cycles.
    let mut legacy = request(PROGRAM);
    legacy.api_version = 1;
    legacy.dialect = "edu-lathe-v1".into();
    let result = compile(&legacy);
    assert!(!result.executable);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "UNSUPPORTED_CODE")
    );
}

/// Exact volume of a monotone exterior shape (points (r, z), z decreasing) inside
/// the Ø50×100 stock: r(z) is clipped to 25 and z to [−100, 0]; full stock after it.
fn analytic_volume(shape: &[(f64, f64)]) -> f64 {
    let mut volume = 0.0;
    let mut covered_to = 0.0f64;
    for pair in shape.windows(2) {
        let ((r0, z0), (r1, z1)) = (pair[0], pair[1]);
        if z0 == z1 {
            continue;
        }
        let r_at = |z: f64| r0 + (z - z0) / (z1 - z0) * (r1 - r0);
        let (top, bottom) = (z0.min(0.0), z1.max(-100.0));
        if top <= bottom {
            continue;
        }
        // Split where the line crosses the stock radius.
        let mut cuts = vec![top, bottom];
        if (r0 - 25.0) * (r1 - 25.0) < 0.0 {
            let z = z0 + (25.0 - r0) / (r1 - r0) * (z1 - z0);
            if z < top && z > bottom {
                cuts.insert(1, z);
            }
        }
        for piece in cuts.windows(2) {
            let (a, b) = (r_at(piece[0]).min(25.0), r_at(piece[1]).min(25.0));
            volume += frustum(piece[0] - piece[1], a, b);
        }
        covered_to = bottom;
    }
    volume + PI * 625.0 * (covered_to + 100.0)
}

#[test]
fn roughing_and_finishing_reproduce_analytic_material_across_depths_and_allowances() {
    // Profiles in (diameter, Z) after the X-only first block at the start Z (2).
    let shapes: [&[(f64, f64)]; 3] = [
        &[
            (20.0, 2.0),
            (20.0, -10.0),
            (30.0, -20.0),
            (30.0, -35.0),
            (50.0, -40.0),
        ],
        &[
            (16.0, 2.0),
            (16.0, -15.0),
            (24.0, -15.0),
            (24.0, -30.0),
            (36.0, -30.0),
            (36.0, -50.0),
            (50.0, -50.0),
        ],
        &[(10.0, 2.0), (30.0, -25.0), (44.0, -60.0), (50.0, -70.0)],
    ];
    let mut checked = 0;
    for shape in shapes {
        let profile_lines: Vec<String> = shape
            .iter()
            .enumerate()
            .map(|(i, (x, z))| {
                if i == 0 {
                    format!("N{} G00 X{x}", 10 * (i + 1))
                } else {
                    format!("N{} G01 X{x} Z{z} F80", 10 * (i + 1))
                }
            })
            .collect();
        let last = 10 * shape.len();
        for depth in [0.5, 0.7, 1.0, 1.3, 2.0, 3.1] {
            for (u, w) in [(0.0, 0.0), (0.4, 0.1), (1.0, 0.25)] {
                for retract in [0.3, 1.0] {
                    let source = format!(
                        "T0101\nS900 M03\nG00 X52 Z2\nG71 U{depth} R{retract}\nG71 P10 Q{last} U{u} W{w} F150\n{}\nG70 P10 Q{last}\nG00 X60 Z5\nM30",
                        profile_lines.join("\n")
                    );
                    let program = compile_v2(&request(&source));
                    assert!(program.executable, "{source}\n{:?}", program.diagnostics);
                    let rough = profile_at(&source, 5);
                    assert!(
                        rough.complete,
                        "rough {depth} {u} {w}: {:?}\n{source}",
                        rough.diagnostics
                    );
                    let shifted: Vec<(f64, f64)> = shape
                        .iter()
                        .map(|(x, z)| (x / 2.0 + u / 2.0, z + w))
                        .collect();
                    let expected = analytic_volume(&shifted);
                    assert!(
                        (exterior_volume(&rough) - expected).abs() < expected * 1e-9,
                        "rough {depth} {u} {w}: {} != {expected}",
                        exterior_volume(&rough)
                    );
                    let finished = profile_at(&source, 6);
                    assert!(
                        finished.complete,
                        "finish {depth} {u} {w}: {:?}",
                        finished.diagnostics
                    );
                    let exact: Vec<(f64, f64)> = shape.iter().map(|(x, z)| (x / 2.0, *z)).collect();
                    let expected = analytic_volume(&exact);
                    assert!((exterior_volume(&finished) - expected).abs() < expected * 1e-9);
                    checked += 1;
                }
            }
        }
    }
    assert_eq!(checked, 3 * 6 * 3 * 2);
}

#[test]
fn review_regressions_feed_g70_order_percent_level_cap_and_single_diagnostics() {
    // F only on the G71 line resolves a profile without its own F.
    let g71_feed =
        "S900 M03\nG00 X52 Z2\nG71 U2 R1\nG71 P10 Q20 F100\nN10 G00 X20\nN20 G01 Z-30\nM30";
    let result = compile_v2(&request(g71_feed));
    assert!(result.executable, "{:?}", result.diagnostics);
    // A G70 before its profile would run the profile twice: rejected.
    let g70_first = "S900 M03\nG00 X52 Z2\nG70 P10 Q50\nG00 X52 Z2\nN10 G00 X20\nN20 G01 Z-10 F80\nN50 X50 Z-40\nM30";
    let result = compile_v2(&request(g70_first));
    assert!(!result.executable);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "CYCLE_PROFILE" && d.span.line == 3)
    );
    // A % line inside the profile is ignored, as in the main flow.
    let percent = PROGRAM.replace("N30 X30 Z-20\n", "N30 X30 Z-20\n%\n");
    assert!(compile_v2(&request(&percent)).executable);
    // The level count is bounded even when no level produces a motion.
    let far = "G01 F100\nG00 X100000 Z2\nG71 U0.01 R0.5\nG71 P10 Q20 W100 F100\nN10 G00 X20\nN20 G01 Z-50\nM30";
    let started = std::time::Instant::now();
    let result = compile_v2(&request(far));
    assert!(started.elapsed().as_secs_f64() < 1.0);
    assert!(result.diagnostics.iter().any(|d| d.code == "CYCLE_LIMIT"));
    // A failed G71 still skips its profile: each error is reported once.
    let failed =
        "S900 M03\nG00 X52 Z2\nG71 U2 R1\nG71 P10 Q20\nN10 G00 X20\nN20 G01 Z-30 F80 M08\nM30";
    let result = compile_v2(&request(failed));
    assert!(!result.executable);
    assert_eq!(result.diagnostics.len(), 1, "{:?}", result.diagnostics);
    // Order error is reported before profile content errors.
    let labelled = "S900 M03\nG00 X52 Z2\nG71 U2 R1\nN10 G71 P10 Q20 F80\nN20 G01 Z-30\nM30";
    let result = compile_v2(&request(labelled));
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("después del bloque G71"))
    );
}
