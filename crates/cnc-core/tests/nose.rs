use cnc_core::*;
use serde_json::to_value;

const RHO: f64 = 0.8;

fn request(source: &str, rows: Vec<(&str, f64)>) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 13,
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
            tool_offsets: Some(
                rows.into_iter()
                    .map(|(tool, rho)| ToolOffset {
                        tool_id: tool.into(),
                        calibration_error_x_mm: 0.0,
                        calibration_error_z_mm: 0.0,
                        wear_x_mm: 0.0,
                        wear_z_mm: 0.0,
                        nose_radius_mm: rho,
                    })
                    .collect(),
            ),
        },
    }
}

fn exterior(source: &str, rows: Vec<(&str, f64)>) -> StockProfileV2 {
    let req = request(source, rows);
    let program = compile_v2(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    match lab_profile_at(&req, 0.0, program.blocks.len()) {
        LabProfile::Exterior(profile) => profile,
        LabProfile::Annular(_) => panic!("exterior expected"),
    }
}

/// Radius of the reconstructed exterior profile at axial `z`.
fn radius_at(profile: &StockProfileV2, z: f64) -> f64 {
    let s = profile
        .spans
        .iter()
        .find(|s| s.z_start_mm <= z && z <= s.z_end_mm)
        .unwrap();
    s.r_start_mm + (z - s.z_start_mm) / (s.z_end_mm - s.z_start_mm) * (s.r_end_mm - s.r_start_mm)
}

const TURN: &str = "T0101\nS900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG01 X60\nG00 Z5\nM30";
const CHAMFER: &str = "T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG01 X50 Z-5\nG00 X60\nG00 Z5\nM30";
const CHAMFER_G42: &str =
    "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nG40 G00 X60\nG00 Z5\nM30";

#[test]
fn zero_radius_keeps_every_motion_and_g42_is_then_a_no_op() {
    let plain = compile_v2(&request(CHAMFER, vec![("roughing-od", 0.0)]));
    let compensated = compile_v2(&request(CHAMFER_G42, vec![("roughing-od", 0.0)]));
    assert!(plain.executable && compensated.executable);
    // Same geometry; only source spans differ (the G42/G40 words lengthen lines).
    let geometry = |r: &CompileResult| {
        r.motions
            .iter()
            .map(|m| to_value((m.kind, m.from, m.to, m.feed_mm_min, m.lead)).unwrap())
            .collect::<Vec<_>>()
    };
    assert_eq!(geometry(&plain), geometry(&compensated));
    assert_eq!(
        compensated.blocks[3].after_state.compensation,
        Some(Compensation::Right)
    );
    assert_eq!(compensated.blocks[5].after_state.compensation, None);
}

#[test]
fn round_nose_turns_exact_cylinders_and_leaves_a_corner_fillet() {
    let profile = exterior(TURN, vec![("roughing-od", RHO)]);
    assert!(profile.complete, "{:?}", profile.diagnostics);
    // Cylinder and face are exact with or without nose radius.
    assert_eq!(radius_at(&profile, -15.0), 23.0);
    assert_eq!(radius_at(&profile, -60.0), 25.0);
    // Fillet of radius ρ centred at (Z−29.2, R23.8), within the 0.01 mm chord tolerance.
    let z = -29.6;
    let fillet = 23.8 - (RHO * RHO - (z + 29.2f64).powi(2)).sqrt();
    assert!(
        (radius_at(&profile, z) - fillet).abs() <= 0.01,
        "{}",
        radius_at(&profile, z)
    );
    let ideal = exterior(TURN, vec![("roughing-od", 0.0)]);
    assert_eq!(
        radius_at(&ideal, -29.6),
        23.0,
        "an ideal point leaves a sharp corner"
    );
}

#[test]
fn uncompensated_chamfer_shows_the_classic_form_error_and_g42_removes_it() {
    // 45° chamfer: the contact line shifts by ρ(√2−1) normal to it, i.e. the
    // radius at fixed Z grows by ρ(2−√2).
    let error = RHO * (2.0 - 2f64.sqrt());
    let uncompensated = exterior(CHAMFER, vec![("roughing-od", RHO)]);
    assert!(uncompensated.complete, "{:?}", uncompensated.diagnostics);
    assert!((radius_at(&uncompensated, -2.5) - (22.5 + error)).abs() < 1e-9);
    let compensated = exterior(CHAMFER_G42, vec![("roughing-od", RHO)]);
    assert!(compensated.complete, "{:?}", compensated.diagnostics);
    assert!((radius_at(&compensated, -2.5) - 22.5).abs() < 1e-12);
    // The displayed imaginary tip is offset while compensating; the DRO is not.
    let program = compile_v2(&request(CHAMFER_G42, vec![("roughing-od", RHO)]));
    let block = &program.blocks[4];
    assert_eq!(
        block.after_state.position,
        Position {
            r_mm: 25.0,
            z_mm: -5.0
        }
    );
    let tip = block.after_state.tip_position.unwrap();
    // Centre = end + ρ·n (right of travel (−1,1)/√2 is (1,1)/√2); tip = centre − ρ(1,1).
    let k = RHO / 2f64.sqrt() - RHO;
    assert!((tip.r_mm - (25.0 + k)).abs() < 1e-12 && (tip.z_mm - (-5.0 + k)).abs() < 1e-12);
    assert!(
        program.motions.iter().any(|m| m.lead),
        "start-up/cancel are lead moves"
    );
}

#[test]
fn boring_with_nose_radius_keeps_the_bore_and_retracts_through_its_fillet() {
    let source = "T5\nS900 M03\nG00 X30 Z2\nG01 Z-40 F100\nG00 X18\nG00 Z5\nM30";
    let req = request(source, vec![("boring-id", RHO)]);
    let blocks = compile_v2(&req).blocks.len();
    let LabProfile::Annular(profile) = lab_profile_at(&req, 20.0, blocks) else {
        panic!("annular expected");
    };
    assert!(profile.complete, "{:?}", profile.diagnostics);
    let mid = profile
        .spans
        .iter()
        .find(|s| s.z_start_mm <= -20.0 && -20.0 <= s.z_end_mm)
        .unwrap();
    assert_eq!((mid.inner_start_mm, mid.inner_end_mm), (15.0, 15.0));
}

#[test]
fn compensation_rules_are_explicit() {
    let cases = [
        (
            "G00 X40 Z2\nG42 G01 Z0 F100\nG02 X50 Z-5 I5 K0\nM30",
            "COMP_ARC",
        ),
        (
            "G00 X40 Z2\nG42 G01 Z0 F100\nT0202\nM30",
            "COMP_TOOL_CHANGE",
        ),
        (
            "G00 X40 Z2\nG42 G01 Z0 F100\nG41 G01 Z-5\nM30",
            "COMP_SIDE_CHANGE",
        ),
        (
            "G00 X52 Z2\nG42\nG71 U2 R1\nG71 P10 Q20 F100\nN10 G00 X20\nN20 G01 Z-10\nM30",
            "COMP_CYCLE",
        ),
    ];
    for (source, code) in cases {
        let result = compile_v2(&request(source, vec![("generic-od", RHO)]));
        assert!(!result.executable, "{code}");
        assert!(
            result.diagnostics.iter().any(|d| d.code == code),
            "{code}: {:?}",
            result.diagnostics
        );
    }
    let mut legacy = request(CHAMFER_G42, vec![]);
    legacy.api_version = 1;
    legacy.dialect = "edu-lathe-v1".into();
    legacy.setup.tool_offsets = None;
    assert!(
        compile(&legacy)
            .diagnostics
            .iter()
            .any(|d| d.code == "UNSUPPORTED_CODE")
    );
    // A shoulder lower than ρ cannot be followed by the compensated nose.
    let gouge = "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 Z-10\nG01 X41 Z-10\nG01 Z-20\nG40 G00 X60\nM30";
    let result = compile_v2(&request(gouge, vec![("roughing-od", RHO)]));
    assert!(
        result.diagnostics.iter().any(|d| d.code == "COMP_GOUGE"),
        "{:?}",
        result.diagnostics
    );
    assert!(result.motions.is_empty() && !result.executable);
    // A start-up move that drives into the stock is diagnosed, not cut.
    let lead = "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z-10 F100\nG01 Z-20\nG40 G00 X60\nM30";
    let req = request(lead, vec![("roughing-od", RHO)]);
    let program = compile_v2(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, program.blocks.len()) else {
        panic!("exterior");
    };
    assert!(
        profile
            .diagnostics
            .iter()
            .any(|d| d.code == "COMP_LEAD_IN_STOCK"),
        "{:?}",
        profile.diagnostics
    );
    // Invalid radius rows are rejected at the boundary.
    let result = compile_v2(&request(TURN, vec![("roughing-od", 6.0)]));
    assert_eq!(result.diagnostics[0].code, "INVALID_REQUEST");
}

#[test]
fn cycles_with_a_round_nose_reconstruct_without_ambiguity() {
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
    for shape in shapes {
        let lines: Vec<String> = shape
            .iter()
            .enumerate()
            .map(|(i, (x, z))| {
                if i == 0 {
                    format!("N10 G00 X{x}")
                } else {
                    format!("N{} G01 X{x} Z{z} F80", 10 * (i + 1))
                }
            })
            .collect();
        let last = 10 * shape.len();
        for depth in [0.7, 2.0] {
            for rho in [0.2, 0.8] {
                let source = format!(
                    "T0101\nS900 M03\nG00 X52 Z2\nG71 U{depth} R1\nG71 P10 Q{last} U0.4 W0.1 F150\n{}\nT0202\nG00 X52 Z2\nG70 P10 Q{last}\nG00 X60 Z5\nM30",
                    lines.join("\n")
                );
                let req = request(&source, vec![("roughing-od", rho), ("finishing-od", rho)]);
                let program = compile_v2(&req);
                assert!(program.executable, "{:?}", program.diagnostics);
                for cursor in 0..=program.blocks.len() {
                    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, cursor) else {
                        panic!("exterior");
                    };
                    assert!(
                        profile.complete,
                        "ρ{rho} U{depth} @{cursor}: {:?}\n{source}",
                        profile.diagnostics
                    );
                }
            }
        }
    }
}

#[test]
fn review_regressions_tips_cancel_moves_ideal_tools_tie_arcs_and_sides() {
    let rows = || vec![("roughing-od", RHO), ("finishing-od", 0.0)];
    // 1. Compensated facing to X0 would put the imaginary tip below the axis.
    let facing = "T0101\nS900 M03\nG00 X54 Z0\nG41 G01 X0 F100\nG40 G00 Z2\nM30";
    let result = compile_v2(&request(facing, rows()));
    assert!(
        result.diagnostics.iter().any(|d| d.code == "COMP_AXIS"),
        "{:?}",
        result.diagnostics
    );
    // 2. Blocks without motion keep the compensated tip.
    let hold = "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nS800\nG01 Z-20\nG40 G00 X60\nM30";
    let program = compile_v2(&request(hold, rows()));
    assert!(program.executable, "{:?}", program.diagnostics);
    assert_eq!(
        program.blocks[5].after_state.tip_position,
        program.blocks[4].after_state.tip_position
    );
    // 3. G40 without its own move before G41 or a tool change is rejected.
    for source in [
        "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nG40\nG41\nG01 Z-10\nM30",
        "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 X50 Z-5\nG40\nT0202\nG42 G01 Z-10\nM30",
    ] {
        let result = compile_v2(&request(source, rows()));
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "COMP_NO_CANCEL_MOVE"),
            "{:?}",
            result.diagnostics
        );
    }
    // 4. A tool with ρ=0 passes arcs through even if another tool has a radius.
    let ideal = "T0202\nS900 M03\nG00 X44 Z2\nG01 Z0 F100\nG02 X44 Z-4 I0 K-2\nG00 X60\nM30";
    let program = compile_v2(&request(ideal, rows()));
    assert!(program.executable, "{:?}", program.diagnostics);
    // 5. An arc ending exactly on the tie radial is accepted.
    let tie =
        "T0101\nS900 M03\nG00 X44 Z-8\nG01 Z-12 F100\nG03 X40 Z-12.828427 I-2 K2\nG00 X60\nM30";
    let program = compile_v2(&request(tie, rows()));
    assert!(
        !program
            .diagnostics
            .iter()
            .any(|d| d.code == "NOSE_ORIENTATION"),
        "{:?}",
        program.diagnostics
    );
    // 6. The wrong side for the tool is diagnosed instead of silently cut.
    let wrong = "T0101\nS900 M03\nG00 X40 Z2\nG41 G01 Z0 F100\nG01 X50 Z-5\nG40 G00 X60\nM30";
    let result = compile_v2(&request(wrong, rows()));
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "COMP_WRONG_SIDE"),
        "{:?}",
        result.diagnostics
    );
    // 7. A null start-up move does not consume the start-up.
    let null =
        "T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG42 G01 Z0\nG01 X50 Z-5\nG40 G00 X60\nM30";
    let program = compile_v2(&request(null, rows()));
    assert!(program.executable, "{:?}", program.diagnostics);
}

#[test]
fn compensated_inside_corner_leaves_a_nose_fillet_and_prefixes_never_rewrite_earlier_blocks() {
    // Cylinder Ø40 then a shoulder up to Ø48: the nose cannot reach the inside corner.
    let shoulder = "T0101\nS900 M03\nG00 X40 Z2\nG42 G01 Z0 F100\nG01 Z-20\nG01 X48\nG01 Z-30\nG40 G00 X60\nG00 Z5\nM30";
    let req = request(shoulder, vec![("roughing-od", RHO)]);
    let program = compile_v2(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, program.blocks.len()) else {
        panic!("exterior");
    };
    assert!(profile.complete, "{:?}", profile.diagnostics);
    assert_eq!(radius_at(&profile, -10.0), 20.0, "cylinder exact");
    assert_eq!(radius_at(&profile, -25.0), 24.0, "second cylinder exact");
    // Fillet centred at (Z−19.2, R20.8): at Z−19.6 the radius is 20.8 − √(ρ² − 0.16).
    let fillet = 20.8 - (RHO * RHO - 0.16f64).sqrt();
    assert!(
        (radius_at(&profile, -19.6) - fillet).abs() <= 0.01,
        "{}",
        radius_at(&profile, -19.6)
    );
    // Every block's motions start where the previous block's motions ended.
    for pair in program.motions.windows(2) {
        assert_eq!(pair[0].to, pair[1].from);
    }
    for cursor in 0..=program.blocks.len() {
        let LabProfile::Exterior(prefix) = lab_profile_at(&req, 0.0, cursor) else {
            panic!()
        };
        assert!(prefix.complete, "@{cursor}: {:?}", prefix.diagnostics);
    }
}
