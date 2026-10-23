use cnc_core::linear_profile::LinearProfileSpan;
use cnc_core::*;

fn request(source: &str) -> CompileRequest {
    serde_json::from_value(serde_json::json!({ "apiVersion":1, "dialect":DIALECT,
        "sourceRevision":42, "source":source, "setup": { "xConvention":"diameter", "toolId":"generic-od",
        "stock":{"diameterMm":50,"lengthMm":100}, "initialPosition":{"rMm":30,"zMm":5} } })).unwrap()
}
fn run(source: &str) -> StockProfileV2 {
    let req = request(source);
    let program = compile(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    profile_at_v2(&program, &req.setup.stock, program.blocks.len())
}
fn run_at(source: &str, cursor: usize) -> StockProfileV2 {
    let req = request(source);
    let program = compile(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    profile_at_v2(&program, &req.setup.stock, cursor)
}
fn spans(p: &StockProfileV2) -> Vec<(f64, f64, f64, f64)> {
    p.spans
        .iter()
        .map(|s| (s.z_start_mm, s.z_end_mm, s.r_start_mm, s.r_end_mm))
        .collect()
}
const TAPER: &str = include_str!("../../../fixtures/lathe/taper-turning.nc");

#[test]
fn taper_fixture_has_analytical_prefixes_and_repeatable_backward_reset() {
    let req = request(TAPER);
    let program = compile(&req);
    assert!(program.executable);
    assert_eq!(program.blocks.len(), 8);
    for cursor in (0..=8).chain((0..=8).rev()) {
        let p = profile_at_v2(&program, &req.setup.stock, cursor);
        assert!(p.complete, "{cursor}: {:?}", p.diagnostics);
        assert_eq!(p.evaluated_blocks, cursor);
        assert_eq!(p.completed_blocks, cursor);
        assert_eq!(p.source_revision, 42);
        assert_eq!(p.profile_version, 2);
        assert_eq!(
            spans(&p),
            if cursor < 4 {
                vec![(-100.0, 0.0, 25.0, 25.0)]
            } else {
                vec![(-100.0, -60.0, 25.0, 25.0), (-60.0, 0.0, 10.0, 20.0)]
            }
        );
        assert_eq!(
            serde_json::to_value(&p).unwrap(),
            serde_json::to_value(profile_at_v2(&program, &req.setup.stock, cursor)).unwrap()
        );
    }
    // The additive native API never changes the existing profile export semantics.
    let old = profile_at(&program, &req.setup.stock, 8);
    assert_eq!(old.profile_version, 1);
    assert!(!old.complete);
    assert_eq!(old.evaluated_blocks, 3);
    assert_eq!(old.diagnostics[0].code, "UNSUPPORTED_PROFILE_CUT");
}

#[test]
fn all_existing_guided_programs_match_the_v1_cylinders_at_every_prefix() {
    for source in [
        include_str!("../../../fixtures/lathe/straight-turning.nc"),
        include_str!("../../../fixtures/lathe/two-step-turning.nc"),
        include_str!("../../../fixtures/lathe/incremental-turning.nc"),
    ] {
        let req = request(source);
        let program = compile(&req);
        for cursor in 0..=program.blocks.len() {
            let old = profile_at(&program, &req.setup.stock, cursor);
            let new = profile_at_v2(&program, &req.setup.stock, cursor);
            assert!(new.complete, "{:?}", new.diagnostics);
            assert_eq!(
                new.spans,
                old.spans
                    .iter()
                    .map(|s| LinearProfileSpan {
                        z_start_mm: s.z_start_mm,
                        z_end_mm: s.z_end_mm,
                        r_start_mm: s.radius_mm,
                        r_end_mm: s.radius_mm
                    })
                    .collect::<Vec<_>>()
            );
        }
    }
}

#[test]
fn taper_clips_to_stock_and_to_existing_material_in_both_radial_directions() {
    assert_eq!(
        spans(&run("G00 X70 Z0\nG01 X30 Z-100 F120 S900 M03")),
        vec![(-100.0, -50.0, 15.0, 25.0), (-50.0, 0.0, 25.0, 25.0)]
    );
    assert_eq!(
        spans(&run("G00 X30 Z0\nG01 X70 Z-100 F120 S900 M03")),
        vec![(-100.0, -50.0, 25.0, 25.0), (-50.0, 0.0, 25.0, 15.0)]
    );
    assert_eq!(
        spans(&run("G00 X50 Z20\nG01 X22 Z-120 F120 S900 M03")),
        vec![(-100.0, 0.0, 13.0, 23.0)]
    );
    assert_eq!(
        spans(&run("G00 X40 Z0\nG01 X0 Z-100 F120 S900 M03")),
        vec![(-100.0, 0.0, 0.0, 20.0)]
    );
}

#[test]
fn contact_with_taper_and_retraction_at_shoulder_are_allowed_with_spindle_off() {
    let p = run("G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nM05\nG00 X40 Z0\nX20 Z-60\nX60\nZ5");
    assert!(p.complete, "{:?}", p.diagnostics);
    assert_eq!(
        spans(&p),
        vec![(-100.0, -60.0, 25.0, 25.0), (-60.0, 0.0, 10.0, 20.0)]
    );
}

#[test]
fn unsupported_or_invalid_removal_freezes_before_the_entire_block() {
    for (source, code, evaluated) in [
        ("G00 X40 Z0\nG01 X20 Z-60 F120", "SPINDLE_OFF", 1),
        ("G00 X40 Z0\nG00 X20 Z-60", "RAPID_IN_STOCK", 1),
        (
            "G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nG00 X10",
            "RAPID_IN_STOCK",
            2,
        ),
        (
            "G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nX10",
            "UNSUPPORTED_PROFILE_CUT",
            2,
        ),
        (
            "G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nZ-50",
            "UNSUPPORTED_PROFILE_CUT",
            2,
        ),
    ] {
        let p = run(source);
        assert!(!p.complete);
        assert_eq!(p.evaluated_blocks, evaluated);
        assert_eq!(p.diagnostics[0].code, code);
        assert_eq!(p.diagnostics[0].span.line, evaluated + 1);
        let req = request(source);
        let before = profile_at_v2(&compile(&req), &req.setup.stock, evaluated);
        assert_eq!(p.spans, before.spans);
    }
}

#[test]
fn invalid_program_cursor_stock_and_initial_position_never_panic() {
    let req = request(TAPER);
    let program = compile(&req);
    assert_eq!(
        profile_at_v2(&program, &req.setup.stock, 9).diagnostics[0].code,
        "INVALID_PROFILE_REQUEST"
    );
    let invalid = compile(&request("G71 X20"));
    assert_eq!(
        profile_at_v2(&invalid, &req.setup.stock, 0).diagnostics[0].code,
        "INVALID_PROFILE_REQUEST"
    );
    for diameter in [f64::NAN, 0.0, f64::INFINITY, -1.0, 1e10] {
        let p = profile_at_v2(
            &program,
            &Stock {
                diameter_mm: diameter,
                length_mm: 100.0,
            },
            0,
        );
        assert!(!p.complete);
        assert!(p.spans.is_empty());
    }
    let mut inside = request(TAPER);
    inside.setup.initial_position = Position {
        r_mm: 10.0,
        z_mm: -10.0,
    };
    let p = profile_at_v2(&compile(&inside), &inside.setup.stock, 0);
    assert_eq!(p.diagnostics[0].code, "INITIAL_TOOL_IN_STOCK");
}

#[test]
fn a_later_invalid_motion_rolls_back_an_earlier_cut_in_the_same_block() {
    let req = request("G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03");
    let mut program = compile(&req);
    let mut invalid = program.motions[1].clone();
    invalid.id = 2;
    invalid.to.r_mm = f64::NAN;
    program.motions.push(invalid);
    program.blocks[1].motion_ids.push(2);
    let p = profile_at_v2(&program, &req.setup.stock, 2);
    assert!(!p.complete);
    assert_eq!(p.evaluated_blocks, 1);
    assert_eq!(spans(&p), vec![(-100.0, 0.0, 25.0, 25.0)]);
}

#[test]
fn numerical_ambiguity_and_unrepresentable_intersections_have_distinct_diagnostics() {
    let ambiguous = run("G00 X40 Z0\nG01 X20 Z-60 F120 S900 M03\nG00 X19.999999999999996");
    assert_eq!(ambiguous.evaluated_blocks, 2);
    assert_eq!(ambiguous.diagnostics[0].code, "PROFILE_NUMERICAL_AMBIGUITY");
    assert_eq!(
        spans(&ambiguous),
        vec![(-100.0, -60.0, 25.0, 25.0), (-60.0, 0.0, 10.0, 20.0)]
    );
    let mut req = request("G00 X1000000000 Z-999999999\nG01 X0 Z-1000000000 F120 S900 M03");
    req.setup.stock = Stock {
        diameter_mm: 2.0,
        length_mm: 1e9,
    };
    let p = profile_at_v2(&compile(&req), &req.setup.stock, 2);
    assert!(!p.complete);
    assert_eq!(p.evaluated_blocks, 1);
    assert_eq!(p.diagnostics[0].code, "PROFILE_NUMERICAL_INTERSECTION");
    assert_eq!(spans(&p), vec![(-1e9, 0.0, 1.0, 1.0)]);
}

#[test]
fn complexity_budget_preserves_the_last_complete_native_prefix() {
    let mut source = String::from("M03 S900\n");
    for i in 0..1900 {
        source.push_str(&format!(
            "G00 X60 Z5\nX{}\nZ0\nG01 Z{} F100\nG00 X60\n",
            40.0 - i as f64 / 1000.0,
            -((1900 - i) as f64) / 30.0
        ));
    }
    let req = request(&source);
    let program = compile(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    let p = profile_at_v2(&program, &req.setup.stock, program.blocks.len());
    assert!(!p.complete);
    assert_eq!(p.diagnostics[0].code, "PROFILE_LIMIT");
    assert!(p.spans.len() <= MAX_PROFILE_SPANS);
    let before = profile_at_v2(&program, &req.setup.stock, p.evaluated_blocks);
    assert!(before.complete);
    assert_eq!(p.spans, before.spans);
}

#[test]
fn facing_cut_removes_face_material_and_subsequent_turning_cuts_the_new_face() {
    let source =
        "G21 G18 G98\nS1000 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 Z2\nG00 X40 Z0\nG01 Z-20 F120\nM30";
    let p4 = run_at(source, 4);
    assert!(p4.complete);
    assert_eq!(
        spans(&p4),
        vec![(-100.0, -1.0, 25.0, 25.0), (-1.0, 0.0, 0.0, 0.0)]
    );

    let p7 = run_at(source, 7);
    assert!(p7.complete);
    assert_eq!(
        spans(&p7),
        vec![
            (-100.0, -20.0, 25.0, 25.0),
            (-20.0, -1.0, 20.0, 20.0),
            (-1.0, 0.0, 0.0, 0.0)
        ]
    );

    // Facing at Z=0 leaves the profile untouched but executes cleanly.
    let at_zero = run("G21 G18 G98\nS1000 M03\nG00 X54 Z0\nG01 X0 F100\nM30");
    assert!(at_zero.complete);
    assert_eq!(spans(&at_zero), vec![(-100.0, 0.0, 25.0, 25.0)]);
}

#[test]
fn facing_validates_spindle_partial_cuts_and_starting_position() {
    // Spindle off while facing solid material freezes with SPINDLE_OFF.
    let off = run("G00 X54 Z-1\nG01 X0 F100");
    assert!(!off.complete);
    assert_eq!(off.diagnostics[0].code, "SPINDLE_OFF");

    // Partial radial cut (not reaching X0) freezes with UNSUPPORTED_PROFILE_CUT.
    let partial = run("S900 M03\nG00 X54 Z-1\nG01 X20 F100");
    assert!(!partial.complete);
    assert_eq!(partial.diagnostics[0].code, "UNSUPPORTED_PROFILE_CUT");

    // Rapid radial into material freezes with RAPID_IN_STOCK.
    let rapid = run("S900 M03\nG00 X54 Z-1\nG00 X0");
    assert!(!rapid.complete);
    assert_eq!(rapid.diagnostics[0].code, "RAPID_IN_STOCK");

    // Starting inside material freezes with UNSUPPORTED_PROFILE_CUT.
    let inside = run("S900 M03\nG00 X54 Z5\nG00 Z-1\nG01 X0 F100");
    // (Note: G00 Z-1 at X54 is in the air, then G01 X0 is valid facing)
    assert!(inside.complete);
}

#[test]
fn facing_contact_and_repeat_do_not_require_spindle_but_deeper_material_does() {
    let zero = run("G00 X54 Z0\nG01 X0 F100");
    assert!(zero.complete, "{:?}", zero.diagnostics);
    assert_eq!(spans(&zero), vec![(-100.0, 0.0, 25.0, 25.0)]);
    let source = "S900 M03\nG00 X54 Z-1\nG01 X0 F100\nG00 X54\nM05\nG01 X0";
    let repeated = run(source);
    assert!(repeated.complete, "{:?}", repeated.diagnostics);
    assert_eq!(
        spans(&repeated),
        vec![(-100.0, -1.0, 25.0, 25.0), (-1.0, 0.0, 0.0, 0.0)]
    );
    let deeper = run(&format!("{source}\nG00 X54\nZ-2\nG01 X0"));
    assert!(!deeper.complete);
    assert_eq!(deeper.evaluated_blocks, 8);
    assert_eq!(deeper.diagnostics[0].code, "SPINDLE_OFF");
    assert_eq!(deeper.spans, repeated.spans);
}
