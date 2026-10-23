use cnc_core::*;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 7,
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
            jaws: None,
        },
    }
}
fn evaluate(source: &str) -> StockProfileV3 {
    let req = request(source);
    let program = compile_v2(&req);
    assert!(program.executable, "{:?}", program.diagnostics);
    profile_at_v3(&program, &req.setup.stock, 20.0, program.blocks.len())
}

#[test]
fn new_tool_and_dialect_are_additive_and_legacy_stays_strict() {
    for alias in ["T5", "T05", "T0505"] {
        let mut req = request(alias);
        let new = compile_v2(&req);
        assert!(new.executable);
        assert_eq!(new.api_version, 2);
        assert_eq!(new.dialect, "edu-lathe-v2");
        assert_eq!(
            new.final_state.unwrap().tool_id.as_deref(),
            Some("boring-id")
        );
        assert!(!compile(&req).executable);
        req.api_version = 1;
        req.dialect = DIALECT.into();
        assert!(!compile_v2(&req).executable);
        let old = compile(&req);
        assert!(!old.executable);
        assert_eq!(old.diagnostics[0].code, "UNSUPPORTED_TOOL");
    }
    for alias in ["T0504", "T005", "T5.0", "T+5", "T6"] {
        assert!(!compile_v2(&request(alias)).executable);
    }
    let mut req = request("G00 Z2");
    req.setup.tool_id = "boring-id".into();
    assert!(compile_v2(&req).executable);
    req.api_version = 1;
    req.dialect = DIALECT.into();
    assert!(!compile(&req).executable);
    req.api_version = 2;
    req.dialect = "edu-lathe-v2".into();
    let v2 = compile_v2(&req);
    assert_eq!(
        profile_at(&v2, &req.setup.stock, 1).diagnostics[0].code,
        "INVALID_PROFILE_REQUEST"
    );
    assert_eq!(
        profile_at_v2(&v2, &req.setup.stock, 1).diagnostics[0].code,
        "INVALID_PROFILE_REQUEST"
    );
}

#[test]
fn boring_and_turning_fixture_matches_the_independent_annular_oracle() {
    let profile = evaluate(include_str!("../../../fixtures/lathe/boring.nc"));
    assert!(profile.complete);
    assert_eq!(profile.evaluated_blocks, 15);
    assert!(profile.diagnostics.is_empty());
    assert!((profile.volume_mm3 - 43000.0 * std::f64::consts::PI).abs() < 1e-9);
    assert_eq!(profile.spans.len(), 3);
    assert_eq!(profile.spans[0].inner_end_mm, 10.0);
    assert_eq!(profile.spans[1].inner_start_mm, 15.0);
    assert_eq!(profile.spans[2].outer_end_mm, 20.0);
}

#[test]
fn each_prefix_reconstructs_deterministically_for_back_and_reset() {
    let req = request(include_str!("../../../fixtures/lathe/boring.nc"));
    let p = compile_v2(&req);
    let prefixes: Vec<_> = (0..=p.blocks.len())
        .map(|n| serde_json::to_value(profile_at_v3(&p, &req.setup.stock, 20.0, n)).unwrap())
        .collect();
    for n in (0..=p.blocks.len()).rev() {
        assert_eq!(
            serde_json::to_value(profile_at_v3(&p, &req.setup.stock, 20.0, n)).unwrap(),
            prefixes[n]
        );
    }
    assert_eq!(
        prefixes[0]["volumeMm3"].as_f64().unwrap(),
        52500.0 * std::f64::consts::PI
    );
}

#[test]
fn a_rapid_in_the_bore_is_air_and_a_wall_crossing_rapid_freezes() {
    assert!(evaluate("G00 X10 Z2\nG00 Z-40\nG00 Z5").complete);
    let stopped = evaluate("G00 X10 Z2\nG00 Z-40\nG00 X60");
    assert!(!stopped.complete);
    assert_eq!(stopped.evaluated_blocks, 2);
    assert_eq!(stopped.diagnostics[0].code, "RAPID_IN_STOCK");
    assert_eq!(stopped.diagnostics[0].span.line, 3);
}

#[test]
fn spindle_unsupported_direction_and_wall_breakthrough_keep_the_previous_profile() {
    for (source, code) in [
        ("T5\nG00 X30 Z2\nG01 Z-40 F100", "SPINDLE_OFF"),
        (
            "T5\nS900 M03\nG00 X18 Z2\nG00 Z-20\nG01 X30 F100",
            "UNSUPPORTED_PROFILE_CUT",
        ),
        (
            "T5\nS900 M03\nG00 X18 Z2\nG00 Z-40\nG01 X30 Z-20 F100",
            "UNSUPPORTED_PROFILE_CUT",
        ),
        (
            "T5\nS900 M03\nG00 X30 Z2\nG01 X60 Z-40 F100",
            "PROFILE_WALL_CROSSING",
        ),
        (
            "T1\nS900 M03\nG00 X60 Z2\nG01 X10 Z-40 F100",
            "PROFILE_WALL_CROSSING",
        ),
    ] {
        let stopped = evaluate(source);
        assert!(!stopped.complete, "{source}");
        assert_eq!(stopped.diagnostics[0].code, code, "{source}");
        assert_eq!(stopped.spans.len(), 1);
        assert_eq!(stopped.spans[0].inner_start_mm, 10.0);
        assert_eq!(stopped.spans[0].outer_end_mm, 25.0);
    }
}

#[test]
fn arcs_are_explicitly_unsupported_and_a_solid_is_not_implicitly_drilled() {
    let stopped = evaluate("S900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100");
    assert_eq!(stopped.diagnostics[0].code, "UNSUPPORTED_ANNULAR_ARC");
    assert_eq!(stopped.evaluated_blocks, 2);
    let req = request("T5\nS900 M03\nG00 X30 Z2\nG01 Z-40 F100");
    let p = compile_v2(&req);
    let stopped = profile_at_v3(&p, &req.setup.stock, 0.0, p.blocks.len());
    assert_eq!(stopped.diagnostics[0].code, "EXISTING_BORE_REQUIRED");
}

#[test]
fn initial_point_in_a_bore_is_allowed_but_in_a_wall_is_not() {
    for (r, allowed) in [(5.0, true), (15.0, false)] {
        let mut req = request("M30");
        req.setup.initial_position = Position {
            r_mm: r,
            z_mm: -20.0,
        };
        let p = compile_v2(&req);
        let result = profile_at_v3(&p, &req.setup.stock, 20.0, 1);
        assert_eq!(result.complete, allowed);
        if !allowed {
            assert_eq!(result.diagnostics[0].code, "INITIAL_TOOL_IN_STOCK");
        }
    }
}

#[test]
fn invalid_requests_and_multiple_motion_blocks_are_atomic() {
    let req = request("T5\nS900 M03\nG00 X30 Z2\nG01 Z-40 F100");
    let mut p = compile_v2(&req);
    for inner in [f64::NAN, -1.0, 50.0] {
        assert_eq!(
            profile_at_v3(&p, &req.setup.stock, inner, 0).diagnostics[0].code,
            "INVALID_PROFILE_REQUEST"
        );
    }
    assert!(!profile_at_v3(&p, &req.setup.stock, 20.0, 100).complete);
    let id = p.motions.len();
    let mut extra = p.motions.last().unwrap().clone();
    extra.id = id;
    extra.kind = MotionKind::Rapid;
    extra.from = extra.to;
    extra.to.r_mm = 30.0;
    p.motions.push(extra);
    p.blocks.last_mut().unwrap().motion_ids.push(id);
    let result = profile_at_v3(&p, &req.setup.stock, 20.0, 4);
    assert_eq!(result.evaluated_blocks, 3);
    assert_eq!(result.diagnostics[0].code, "RAPID_IN_STOCK");
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].inner_end_mm, 10.0);
}

#[test]
fn tubular_facing_and_later_boring_preserve_prefixes_and_analytic_volume() {
    let source = "S900 M03\nT0404\nG00 X60 Z-5\nG01 X20 F120\nG00 Z2\nT0505\nG00 X30\nG01 Z-40\nG00 X18\nG00 Z2\nG00 X60 Z5\nM05\nM30";
    let req = request(source);
    let program = compile_v2(&req);
    assert!(program.executable);
    for cursor in 0..=program.blocks.len() {
        let profile = profile_at_v3(&program, &req.setup.stock, 20.0, cursor);
        assert!(
            profile.complete,
            "cursor {cursor}: {:?}",
            profile.diagnostics
        );
        let factor = if cursor < 4 {
            52500.0
        } else if cursor < 8 {
            49875.0
        } else {
            45500.0
        };
        assert!((profile.volume_mm3 - factor * std::f64::consts::PI).abs() < 1e-7);
        assert_eq!(profile.evaluated_blocks, cursor);
    }
}

#[test]
fn tubular_facing_rejects_partial_internal_rapid_and_spindle_off_cuts() {
    for (source, code, evaluated) in [
        (
            "S900 M03\nG00 X60 Z-5\nG01 X30 F120",
            "UNSUPPORTED_PROFILE_CUT",
            2,
        ),
        ("G00 X60 Z-5\nG01 X20 F120", "SPINDLE_OFF", 1),
        ("S900 M03\nG00 X60 Z-5\nG00 X20", "RAPID_IN_STOCK", 2),
        (
            "S900 M03\nT0505\nG00 X60 Z-5\nG01 X20 F120",
            "UNSUPPORTED_PROFILE_CUT",
            3,
        ),
    ] {
        let profile = evaluate(source);
        assert!(!profile.complete);
        assert_eq!(profile.diagnostics[0].code, code);
        assert_eq!(profile.evaluated_blocks, evaluated);
        assert!((profile.volume_mm3 - 52500.0 * std::f64::consts::PI).abs() < 1e-7);
    }
    let repeated = evaluate(
        "S900 M03\nG00 X60 Z-5\nG01 X20 F120\nG00 Z2\nG00 X60\nG00 Z-5\nM05\nG01 X20 F120",
    );
    assert!(repeated.complete, "{:?}", repeated.diagnostics);
    assert!((repeated.volume_mm3 - 49875.0 * std::f64::consts::PI).abs() < 1e-7);
}
