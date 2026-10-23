use cnc_core::*;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 12,
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
fn run(source: &str) -> StockProfile {
    let req = request(source);
    let program = compile(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    profile_at(&program, &req.setup.stock, program.blocks.len())
}
fn spans(profile: &StockProfile) -> Vec<(f64, f64, f64)> {
    profile
        .spans
        .iter()
        .map(|s| (s.z_start_mm, s.z_end_mm, s.radius_mm))
        .collect()
}
fn frozen(source: &str, code: &str, evaluated: usize) -> StockProfile {
    let result = run(source);
    assert!(!result.complete, "{source}");
    assert_eq!(result.evaluated_blocks, evaluated);
    assert_eq!(result.diagnostics[0].code, code);
    assert_eq!(result.diagnostics[0].severity, Severity::Warning);
    assert_eq!(result.diagnostics[0].span.line, evaluated + 1);
    result
}
#[test]
fn untouched_cylinder_and_air_travel() {
    for source in [
        "",
        "M03 S900\nG00 X60 Z-120\nG01 X70 Z10 F100\nM30",
        "G01 X40 Z0 F100",
    ] {
        let result = run(source);
        assert!(result.complete);
        assert_eq!(spans(&result), vec![(-100.0, 0.0, 25.0)]);
        assert_eq!(result.source_revision, 12);
    }
}
#[test]
fn exact_cylinder_cut_and_two_steps_with_clear_retraction() {
    let cylinder = run("G00 X40 Z0\nM03 S900\nG01 Z-100 F100");
    assert!(cylinder.complete);
    assert_eq!(spans(&cylinder), vec![(-100.0, 0.0, 20.0)]);
    let stepped = run("G00 X40 Z0\nM03 S900\nG01 Z-60 F100\nX60\nG00 Z5\nX30\nZ0\nG01 Z-20\nX60");
    assert!(stepped.complete, "{:?}", stepped.diagnostics);
    assert_eq!(
        spans(&stepped),
        vec![
            (-100.0, -60.0, 25.0),
            (-60.0, -20.0, 20.0),
            (-20.0, 0.0, 15.0)
        ]
    );
}
#[test]
fn rapid_collision_freezes_before_block_and_uses_source_span() {
    let profile = frozen(
        "G00 X40 Z0\nG00 Z-10\nG01 Z-50 F100 M03 S900",
        "RAPID_IN_STOCK",
        1,
    );
    assert_eq!(spans(&profile), vec![(-100.0, 0.0, 25.0)]);
    // Both endpoints are outside: the whole segment must still be checked.
    frozen("G00 X40 Z-110", "RAPID_IN_STOCK", 0);
    let profile = run("; comment\nG00 X40 Z0\n\nG00 Z-10");
    assert_eq!(profile.diagnostics[0].span.line, 4);
}
#[test]
fn spindle_is_required_only_for_removal_and_uses_same_block_state() {
    frozen("G00 X40 Z0\nG01 Z-30 F100", "SPINDLE_OFF", 1);
    frozen("G00 X40 Z0\nM03 S0\nG01 Z-30 F100", "SPINDLE_OFF", 2);
    for spindle in ["M03", "M04"] {
        let result = run(&format!(
            "G00 X40 Z0\nG01 Z-30 F100 {spindle} S500\nM05\nG01 Z0\nG00 Z5"
        ));
        assert!(result.complete, "{:?}", result.diagnostics);
    }
    frozen("G00 X40 Z0\nM03 S900\nG01 Z-10 F100 M05", "SPINDLE_OFF", 2);
}
#[test]
fn unsupported_removal_freezes_but_surface_and_cleared_moves_work() {
    frozen("M03 S900\nG01 X40 Z-20 F100", "UNSUPPORTED_PROFILE_CUT", 1);
    frozen(
        "M03 S900\nG00 Z-20\nG01 X40 F100",
        "UNSUPPORTED_PROFILE_CUT",
        2,
    );
    frozen(
        "G00 Z-110\nX40\nM03 S900\nG01 Z-20 F100",
        "UNSUPPORTED_PROFILE_CUT",
        3,
    );
    let result = run(
        "G00 X40 Z0\nM03 S900\nG01 Z-20 F100\nG00 X60\nG00 Z0\nX40\nG01 Z-20\nG01 Z0\nX50\nZ-100",
    );
    assert!(result.complete, "{:?}", result.diagnostics);
    assert_eq!(
        spans(&result),
        vec![(-100.0, -20.0, 25.0), (-20.0, 0.0, 20.0)]
    );
    // Radial inward travel below both shoulder radii is still unsupported.
    frozen(
        "G00 X40 Z0\nM03 S900\nG01 Z-20 F100\nX30",
        "UNSUPPORTED_PROFILE_CUT",
        3,
    );
}
#[test]
fn initial_inside_stock_is_explicit_and_does_not_execute_a_prefix() {
    let mut req = request("M03 S900\nG01 Z-30 F100");
    req.setup.initial_position = Position {
        r_mm: 20.0,
        z_mm: -1.0,
    };
    let program = compile(&req);
    let profile = profile_at(&program, &req.setup.stock, 0);
    assert!(!profile.complete);
    assert_eq!(profile.diagnostics[0].code, "INITIAL_TOOL_IN_STOCK");
    assert_eq!(spans(&profile), vec![(-100.0, 0.0, 25.0)]);
}
#[test]
fn stepping_reset_and_rewind_reconstruct_exactly() {
    let req = request("G00 X40 Z0\nM03 S900\nG01 Z-20 F100\nX60\nG00 Z5\nX30\nZ0\nG01 Z-10");
    let program = compile(&req);
    let final_profile = profile_at(&program, &req.setup.stock, program.blocks.len());
    for cursor in [0, 3, 8, 1, 3, 0, 8] {
        let a = profile_at(&program, &req.setup.stock, cursor);
        let b = profile_at(&program, &req.setup.stock, cursor);
        assert!(a.complete);
        assert_eq!(
            serde_json::to_value(&a).unwrap(),
            serde_json::to_value(&b).unwrap()
        );
    }
    assert_eq!(
        spans(&final_profile),
        vec![
            (-100.0, -20.0, 25.0),
            (-20.0, -10.0, 20.0),
            (-10.0, 0.0, 15.0)
        ]
    );
    let bad_req = request("G00 X40 Z0\nG00 Z-10");
    let bad = compile(&bad_req);
    assert!(!profile_at(&bad, &bad_req.setup.stock, 2).complete);
    assert!(profile_at(&bad, &bad_req.setup.stock, 1).complete);
}
#[test]
fn clamping_zero_radius_and_exact_subnanometer_cuts() {
    let result = run("G00 X0 Z0\nG01 Z-120 F100 M03 S900");
    assert!(result.complete);
    assert_eq!(spans(&result), vec![(-100.0, 0.0, 0.0)]);
    let result = run("G00 X49.999999999998 Z0\nG01 Z-0.000000000001 F100 M03 S900");
    assert!(result.complete);
    assert_eq!(result.spans.len(), 2);
    assert_eq!(result.spans[1].z_start_mm, -1e-12);
    assert!(result.spans[1].radius_mm < 25.0);
    let mut req = request("G00 X0.000000000001 Z0\nG01 Z-0.000000000001 F100 M03 S900");
    req.setup.stock = Stock {
        diameter_mm: 2e-12,
        length_mm: 1e-12,
    };
    let program = compile(&req);
    let profile = profile_at(&program, &req.setup.stock, 2);
    assert!(profile.complete);
    assert_eq!(spans(&profile), vec![(-1e-12, 0.0, 5e-13)]);
}
#[test]
fn invalid_requests_return_diagnostics_without_panicking() {
    let req = request("G00 X60");
    let program = compile(&req);
    for stock in [
        Stock {
            diameter_mm: f64::NAN,
            length_mm: 10.0,
        },
        Stock {
            diameter_mm: 50.0,
            length_mm: 0.0,
        },
        Stock {
            diameter_mm: f64::from_bits(1),
            length_mm: 10.0,
        },
    ] {
        let profile = profile_at(&program, &stock, 0);
        assert!(!profile.complete);
        assert_eq!(profile.diagnostics[0].code, "INVALID_PROFILE_REQUEST");
    }
    assert!(!profile_at(&program, &req.setup.stock, 2).complete);
    let invalid = compile(&request("G71 X10"));
    assert!(!profile_at(&invalid, &req.setup.stock, 0).complete);
    let mut corrupt = program;
    corrupt.blocks[0].motion_ids = vec![usize::MAX];
    assert!(!profile_at(&corrupt, &req.setup.stock, 1).complete);
}
#[test]
fn complexity_limit_preserves_an_entire_valid_block_prefix() {
    let mut source = String::from("M03 S900\n");
    for i in 0..2200 {
        source.push_str(&format!(
            "G00 X60 Z5\nX{}\nZ0\nG01 Z{} F100\nG00 X60\n",
            40.0 - (i as f64) / 1000.0,
            -((2200 - i) as f64) / 30.0
        ));
    }
    // Stay within interpreter's source/block limits while forcing many scans.
    source.truncate(source.rfind("G00 X60\n").unwrap() + 8);
    let mut req = request(&source);
    // 1+5*1990 = 9951 blocks.
    req.source = source.lines().take(9951).collect::<Vec<_>>().join("\n");
    let program = compile(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    let result = profile_at(&program, &req.setup.stock, program.blocks.len());
    assert!(!result.complete);
    assert_eq!(result.diagnostics[0].code, "PROFILE_LIMIT");
    assert!(result.spans.len() <= 4096);
    let rewind = profile_at(&program, &req.setup.stock, result.evaluated_blocks);
    assert!(rewind.complete);
    assert_eq!(spans(&rewind), spans(&result));
}

#[test]
fn two_step_fixture_has_exact_analytical_profiles() {
    let req = request(include_str!("../../../fixtures/lathe/two-step-turning.nc"));
    let program = compile(&req);
    assert!(program.executable);
    let expected: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/two-step-turning.profile.json"
    ))
    .unwrap();
    for (cursor, key) in [
        (5, "afterFirstCut"),
        (9, "afterSecondCut"),
        (13, "afterSecondCut"),
    ] {
        let result = profile_at(&program, &req.setup.stock, cursor);
        assert!(result.complete, "{:?}", result.diagnostics);
        let expected_spans: Vec<ProfileSpan> =
            serde_json::from_value(expected[key].clone()).unwrap();
        assert_eq!(result.spans, expected_spans);
    }
}
