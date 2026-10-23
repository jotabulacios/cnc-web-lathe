use cnc_core::*;
use serde_json::to_value;
use std::f64::consts::PI;

fn request(source: &str, tool_id: &str, offsets: Option<Vec<ToolOffset>>) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 9,
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
            tool_id: tool_id.into(),
            tool_offsets: offsets,
            jaws: None,
        },
    }
}

fn row(tool_id: &str, error_x: f64, error_z: f64, wear_x: f64, wear_z: f64) -> ToolOffset {
    ToolOffset {
        tool_id: tool_id.into(),
        calibration_error_x_mm: error_x,
        calibration_error_z_mm: error_z,
        wear_x_mm: wear_x,
        wear_z_mm: wear_z,
        nose_radius_mm: 0.0,
    }
}

const TURN_T1: &str = "T0101\nS900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30";

fn exterior(source: &str, offsets: Vec<ToolOffset>) -> StockProfileV2 {
    let req = request(source, "generic-od", Some(offsets));
    let blocks = compile_v2(&req).blocks.len();
    match lab_profile_at(&req, 0.0, blocks) {
        LabProfile::Exterior(profile) => profile,
        LabProfile::Annular(_) => panic!("solid without T5 is exterior"),
    }
}

fn spans(profile: &StockProfileV2) -> Vec<[f64; 4]> {
    profile
        .spans
        .iter()
        .map(|s| [s.z_start_mm, s.z_end_mm, s.r_start_mm, s.r_end_mm])
        .collect()
}

#[test]
fn zero_or_absent_table_reproduces_the_programmed_path_exactly() {
    let plain = compile_v2(&request(TURN_T1, "generic-od", None));
    let zero = compile_v2(&request(
        TURN_T1,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, 0.0, 0.0)]),
    ));
    assert!(plain.executable && zero.executable);
    assert_eq!(
        to_value(&plain.motions).unwrap(),
        to_value(&zero.motions).unwrap()
    );
    assert!(
        plain
            .blocks
            .iter()
            .all(|b| b.after_state.tip_position.is_none())
    );
    for block in &zero.blocks {
        assert_eq!(
            block.after_state.tip_position,
            Some(block.after_state.position)
        );
    }
}

#[test]
fn wear_in_diameter_changes_the_turned_diameter_by_the_same_diameter_amount() {
    // Oracle: Ø46 programmed, X wear −0.2 (diameter) → Ø45.8, i.e. radius 22.9.
    let profile = exterior(TURN_T1, vec![row("roughing-od", 0.0, 0.0, -0.2, 0.0)]);
    assert!(profile.complete, "{:?}", profile.diagnostics);
    assert_eq!(
        spans(&profile),
        vec![[-100.0, -30.0, 25.0, 25.0], [-30.0, 0.0, 22.9, 22.9]]
    );
    // Calibration error and wear add; Z moves the shoulder.
    // 23 + 0.05 − 0.15 is not exact in binary floating point: compare within 1e-12.
    let profile = exterior(TURN_T1, vec![row("roughing-od", 0.1, 0.5, -0.3, 0.0)]);
    let expected = [[-100.0, -29.5, 25.0, 25.0], [-29.5, 0.0, 22.9, 22.9]];
    let actual = spans(&profile);
    assert_eq!(actual.len(), expected.len());
    for (a, e) in actual.iter().flatten().zip(expected.iter().flatten()) {
        assert!((a - e).abs() < 1e-12, "{actual:?}");
    }
    // Only the active station's row applies.
    let other = exterior(TURN_T1, vec![row("finishing-od", 0.0, 0.0, -2.0, 0.0)]);
    assert_eq!(
        spans(&other),
        vec![[-100.0, -30.0, 25.0, 25.0], [-30.0, 0.0, 23.0, 23.0]]
    );
}

#[test]
fn activation_happens_with_the_next_motion_and_the_display_stays_programmed() {
    let source = "G00 X46 Z2\nT0101\nG00 X46 Z2\nM30";
    let program = compile_v2(&request(
        source,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, -0.2, 0.4)]),
    ));
    assert!(program.executable, "{:?}", program.diagnostics);
    let t_block = &program.blocks[1];
    assert!(t_block.motion_ids.is_empty(), "a T block never moves");
    let before_offset = Position {
        r_mm: 23.0,
        z_mm: 2.0,
    };
    assert_eq!(t_block.after_state.tip_position, Some(before_offset));
    let motion = &program.motions[1];
    assert_eq!(motion.from, before_offset);
    assert_eq!(
        motion.to,
        Position {
            r_mm: 22.9,
            z_mm: 2.4
        }
    );
    assert!((motion.length_mm - 0.1f64.hypot(0.4)).abs() < 1e-12);
    // DRO coordinates remain the programmed ones.
    assert_eq!(program.blocks[2].after_state.position, before_offset);
}

#[test]
fn arcs_translate_rigidly_and_an_offset_change_right_before_an_arc_is_diagnosed() {
    let arc = "T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG03 X50 Z-5 I0 K-5\nG00 X60 Z5\nM30";
    let program = compile_v2(&request(
        arc,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, 0.4, -0.3)]),
    ));
    assert!(program.executable, "{:?}", program.diagnostics);
    let motion = program.motions.iter().find(|m| m.arc.is_some()).unwrap();
    let geometry = motion.arc.unwrap();
    for end in [motion.from, motion.to] {
        let radius = (end.r_mm - geometry.center.r_mm).hypot(end.z_mm - geometry.center.z_mm);
        assert!((radius - geometry.radius_mm).abs() < ARC_RADIUS_EPS_MM);
    }
    assert!((motion.to.r_mm - 25.2).abs() < 1e-12 && (motion.to.z_mm + 5.3).abs() < 1e-12);

    let changed = arc.replace("G01 Z0 F100\n", "G01 Z0 F100\nT0202\n");
    let program = compile_v2(&request(
        &changed,
        "generic-od",
        Some(vec![row("finishing-od", 0.2, 0.0, 0.0, 0.0)]),
    ));
    assert!(!program.executable);
    assert!(program.motions.is_empty() && program.final_state.is_none());
    let diagnostic = program
        .diagnostics
        .iter()
        .find(|d| d.code == "OFFSET_BEFORE_ARC")
        .unwrap();
    assert_eq!(diagnostic.span.line, 6);
}

#[test]
fn invalid_tables_and_axis_crossing_are_explicit_and_atomic() {
    let v1 = CompileRequest {
        api_version: 1,
        dialect: "edu-lathe-v1".into(),
        ..request(TURN_T1, "generic-od", Some(vec![]))
    };
    let result = compile(&v1);
    assert!(!result.executable);
    assert_eq!(result.diagnostics[0].code, "INVALID_REQUEST");
    for table in [
        vec![
            row("roughing-od", 0.0, 0.0, 0.0, 0.0),
            row("roughing-od", 0.0, 0.0, 0.0, 0.0),
        ],
        vec![row("other", 0.0, 0.0, 0.0, 0.0)],
        vec![row("roughing-od", 100.5, 0.0, 0.0, 0.0)],
        vec![row("roughing-od", f64::NAN, 0.0, 0.0, 0.0)],
    ] {
        let result = compile_v2(&request(TURN_T1, "generic-od", Some(table)));
        assert!(!result.executable);
        assert_eq!(result.diagnostics[0].code, "INVALID_REQUEST");
    }
    // Facing to X0 with wear X −0.2 would put the physical tip at R−0.1.
    let facing = "T0404\nS900 M03\nG00 X52 Z0\nG01 X0 F80\nG00 Z5\nM30";
    let result = compile_v2(&request(
        facing,
        "generic-od",
        Some(vec![row("facing-od", 0.0, 0.0, -0.2, 0.0)]),
    ));
    assert!(!result.executable && result.motions.is_empty());
    let diagnostic = result
        .diagnostics
        .iter()
        .find(|d| d.code == "TOOL_OFFSET")
        .unwrap();
    assert_eq!(diagnostic.span.line, 4);
}

#[test]
fn annular_model_bores_to_the_corrected_diameter() {
    // Oracle: bore programmed Ø30, X wear +0.4 → Ø30.4 (radius 15.2) to Z−40.
    let source = "T5\nS900 M03\nG00 X30 Z2\nG01 Z-40 F100\nG00 X18\nG00 Z5\nM30";
    let req = request(
        source,
        "generic-od",
        Some(vec![row("boring-id", 0.0, 0.0, 0.4, 0.0)]),
    );
    let blocks = compile_v2(&req).blocks.len();
    let LabProfile::Annular(profile) = lab_profile_at(&req, 20.0, blocks) else {
        panic!("bore selects the annular model");
    };
    assert!(profile.complete, "{:?}", profile.diagnostics);
    let expected = PI * (40.0 * (625.0 - 15.2 * 15.2) + 60.0 * (625.0 - 100.0));
    assert!((profile.volume_mm3 - expected).abs() <= expected * 1e-12);
}

#[test]
fn translated_arcs_stay_off_the_axis_and_need_a_corrected_start() {
    // Programmed arc touches R1 at its lowest point (center R1, radius 1 → R0 at the bottom).
    let near_axis = "T0101\nS900 M03\nG00 X2 Z1\nG02 X2 Z-1 I0 K-1 F50\nG00 X60 Z5\nM30";
    let plain = compile_v2(&request(near_axis, "generic-od", None));
    assert!(plain.executable, "{:?}", plain.diagnostics);
    let shifted = compile_v2(&request(
        near_axis,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, -0.2, 0.0)]),
    ));
    assert!(!shifted.executable);
    assert!(shifted.initial_state.tip_position.is_none());
    let diagnostic = shifted
        .diagnostics
        .iter()
        .find(|d| d.code == "TOOL_OFFSET")
        .unwrap();
    assert_eq!(diagnostic.span.line, 4);
    // Setup tool with a correction and an arc as first motion: no corrected start yet.
    let first_arc = "S900 M03\nG02 X60 Z-5 I0 K-5 F50\nM30";
    assert!(compile_v2(&request(first_arc, "roughing-od", None)).executable);
    let result = compile_v2(&request(
        first_arc,
        "roughing-od",
        Some(vec![row("roughing-od", 0.0, 0.0, 0.2, 0.0)]),
    ));
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "OFFSET_BEFORE_ARC")
    );
    // Zero row: arcs are bit-for-bit the programmed ones.
    let arc = "T0101\nS900 M03\nG00 X40 Z2\nG01 Z0 F100\nG03 X50 Z-5 I0 K-5\nG00 X60 Z5\nM30";
    let zero = compile_v2(&request(
        arc,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, 0.0, 0.0)]),
    ));
    let none = compile_v2(&request(arc, "generic-od", None));
    assert_eq!(
        to_value(&zero.motions).unwrap(),
        to_value(&none.motions).unwrap()
    );
    // Translated arc keeps sweep and direction.
    let moved = compile_v2(&request(
        arc,
        "generic-od",
        Some(vec![row("roughing-od", 0.0, 0.0, 0.4, -0.3)]),
    ));
    let (a, b) = (none.motions[2].arc.unwrap(), moved.motions[2].arc.unwrap());
    assert_eq!(
        (a.clockwise, a.sweep_rad, a.radius_mm),
        (b.clockwise, b.sweep_rad, b.radius_mm)
    );
}

#[test]
fn exterior_lab_profile_rejects_an_invalid_table_instead_of_ignoring_it() {
    let req = request(
        TURN_T1,
        "generic-od",
        Some(vec![row("roughing-od", 500.0, 0.0, 0.0, 0.0)]),
    );
    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, 3) else {
        panic!("solid without T5 is exterior");
    };
    assert!(!profile.complete);
    assert_eq!(profile.evaluated_blocks, 0);
}
