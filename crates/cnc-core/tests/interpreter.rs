use cnc_core::*;
use serde_json::Value;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 7,
        source: source.into(),
        setup: serde_json::from_str(include_str!("../../../fixtures/lathe/setup.json")).unwrap(),
    }
}

#[test]
fn acceptance_fixture_preserves_every_block_and_physical_coordinate() {
    let r = compile(&request(include_str!(
        "../../../fixtures/lathe/first-program.nc"
    )));
    let expected: Value = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/first-program.expected.json"
    ))
    .unwrap();
    assert!(r.executable, "{:?}", r.diagnostics);
    assert_eq!(r.blocks.len(), 9);
    assert_eq!(r.source_revision, 7);
    for (i, block) in r.blocks.iter().enumerate() {
        let p = block.after_state.position;
        assert_eq!(p.r_mm, expected["positions"][i][0].as_f64().unwrap());
        assert_eq!(p.z_mm, expected["positions"][i][1].as_f64().unwrap());
        assert_eq!(
            block.after_state.spindle_on,
            expected["spindleOn"][i].as_bool().unwrap()
        );
        assert_eq!(
            block.before_state,
            if i == 0 {
                r.initial_state.clone()
            } else {
                r.blocks[i - 1].after_state.clone()
            }
        );
        assert_eq!(block.span.line, i + 1);
    }
    assert_eq!(r.motions.len(), 5);
    for (i, m) in r.motions.iter().enumerate() {
        assert_eq!(
            serde_json::to_value(m.kind).unwrap(),
            expected["motionKinds"][i]
        );
        assert_eq!(
            m.span.line,
            expected["motionLines"][i].as_u64().unwrap() as usize
        );
        assert_eq!(r.blocks[m.block_id].motion_ids, vec![m.id]);
    }
    assert!(r.final_state.unwrap().ended);
}

#[test]
fn unsupported_or_invalid_input_never_executes_a_prefix() {
    for (source, code) in [
        ("G00 X54\nG71 X10 Z-5", "UNSUPPORTED_CODE"),
        ("M123", "UNSUPPORTED_CODE"),
        ("G01 X10 F100 garbage @", "MISSING_NUMBER"),
        ("G1.4 X10", "UNSUPPORTED_CODE"),
        ("G00 X1 X2", "DUPLICATE_WORD"),
        ("G00 X2 U1", "AXIS_CONFLICT"),
        ("G00 Z1 W2", "AXIS_CONFLICT"),
        ("G00 G01 X1 F100", "MODAL_CONFLICT"),
        ("G00 G00 X1", "MODAL_CONFLICT"),
        ("M03 M05", "MODAL_CONFLICT"),
        ("G00 X-1", "POSITION_RANGE"),
        ("G01 X5", "MISSING_FEED"),
        ("X5", "MISSING_MOTION"),
        ("F0", "INVALID_FEED"),
        ("F-1", "INVALID_FEED"),
        ("S-1", "INVALID_SPINDLE"),
        ("(incompleto", "UNCLOSED_COMMENT"),
        ("(a (b))", "NESTED_COMMENT"),
        ("G00 Y1", "UNSUPPORTED_WORD"),
        ("A1", "UNSUPPORTED_WORD"),
        ("T0505", "UNSUPPORTED_TOOL"),
        ("T0102", "INVALID_TOOL_OFFSET"),
        ("T1.5", "INVALID_TOOL_NUMBER"),
        ("G90", "UNSUPPORTED_CODE"),
        ("G91", "UNSUPPORTED_CODE"),
        ("G99", "UNSUPPORTED_CODE"),
        ("G20", "UNSUPPORTED_CODE"),
        ("G17", "UNSUPPORTED_CODE"),
        ("/G00 X1", "INVALID_CHARACTER"),
        ("G00 X1.2.3", "INVALID_CHARACTER"),
        ("G00 X+", "MISSING_NUMBER"),
        ("M30 X1", "END_WITH_MOTION"),
        ("G00 X1000000001", "NUMBER_RANGE"),
        ("N1.5 G00 X2", "INVALID_LABEL"),
    ] {
        let r = compile(&request(source));
        assert!(!r.executable, "{source}");
        assert!(
            r.blocks.is_empty() && r.motions.is_empty() && r.final_state.is_none(),
            "{source}"
        );
        assert!(
            r.diagnostics.iter().any(|d| d.code == code),
            "{source}: {:?}",
            r.diagnostics
        );
    }
}

#[test]
fn modal_incremental_and_feed_are_physical_not_diametral() {
    let r = compile(&request("g1x50z0f120\nU-4W-3\nZ-10"));
    assert!(r.executable);
    assert_eq!(
        r.motions[1].to,
        Position {
            r_mm: 23.0,
            z_mm: -3.0
        }
    );
    assert!((r.motions[1].length_mm - 13_f64.sqrt()).abs() < 1e-9);
    assert_eq!(r.motions[1].feed_mm_min, Some(120.0));
    assert_eq!(r.motions[2].to.r_mm, 23.0);
}

#[test]
fn state_only_blocks_and_end_are_not_lost() {
    for end in ["M02", "M30"] {
        let r = compile(&request(&format!(
            "F120\nS900 M04\nM05\n{end}\nG00 X999\nG71 X1"
        )));
        assert!(r.executable);
        assert_eq!(r.blocks.len(), 4);
        assert!(r.motions.is_empty());
        assert_eq!(
            r.blocks[1].after_state.spindle_direction,
            SpindleDirection::Ccw
        );
        assert_eq!(r.diagnostics.len(), 2);
        assert!(
            r.diagnostics
                .iter()
                .all(|d| d.code == "AFTER_END" && d.severity == Severity::Warning)
        );
    }
}

#[test]
fn comments_crlf_metadata_and_utf16_spans() {
    let r = compile(&request(
        "%\r\nO123\r\nN10 (😀) G00 X10 ; hola\r\n; solo comentario\r\n%",
    ));
    assert!(r.executable);
    assert_eq!(r.blocks.len(), 1);
    assert_eq!(r.blocks[0].span.line, 3);
    let bad = compile(&request("(😀) Y1"));
    assert_eq!(bad.diagnostics[0].span.column_start, 6);
    assert_eq!(bad.diagnostics[0].span.column_end, 8);
}

#[test]
fn empty_input_has_initial_and_final_state_but_no_steps() {
    for source in ["", ";hola\n(😀)", "N1\nO1\n%"] {
        let r = compile(&request(source));
        assert!(r.executable && r.blocks.is_empty() && r.motions.is_empty());
        assert_eq!(r.final_state, Some(r.initial_state));
    }
}

#[test]
fn invalid_setup_and_contract_are_rejected() {
    let mut req = request("G00 X10");
    for version in [0, 2] {
        req.api_version = version;
        assert!(!compile(&req).executable);
    }
    req.api_version = 1;
    req.dialect = "fanuc".into();
    assert!(!compile(&req).executable);
    req.dialect = DIALECT.into();
    req.setup.x_convention = "radius".into();
    assert!(!compile(&req).executable);
    req.setup.x_convention = "diameter".into();
    req.setup.stock.diameter_mm = 0.0;
    assert!(!compile(&req).executable);
    req.setup.stock.diameter_mm = 50.0;
    req.setup.initial_position.r_mm = f64::NAN;
    let r = compile(&req);
    assert!(!r.executable);
    assert!(r.initial_state.position.r_mm.is_finite());
}

#[test]
fn limits_are_visible_and_atomic() {
    for source in [
        " ".repeat(MAX_SOURCE_BYTES + 1),
        "G00 X1\n".repeat(MAX_BLOCKS + 1),
    ] {
        let r = compile(&request(&source));
        assert!(!r.executable && r.motions.is_empty() && r.blocks.is_empty());
        assert!(r.diagnostics.iter().any(|d| d.code.ends_with("LIMIT")));
    }
}

#[test]
fn linear_endpoints_and_diameter_invariants_on_a_deterministic_grid() {
    for x in [0.0, 0.5, 20.0, 100.0] {
        for z in [-100.0, -0.5, 0.0, 20.0] {
            let r = compile(&request(&format!("G01 X{x} Z{z} F50\nU2 W-1")));
            assert!(r.executable);
            assert_eq!(
                r.motions[0].to,
                Position {
                    r_mm: x / 2.0,
                    z_mm: z
                }
            );
            assert_eq!(
                r.motions[1].to,
                Position {
                    r_mm: x / 2.0 + 1.0,
                    z_mm: z - 1.0
                }
            );
            assert!(
                r.motions
                    .iter()
                    .all(|m| m.length_mm.is_finite() && m.length_mm >= 0.0)
            );
        }
    }
}

#[test]
fn complete_contract_fixture_matches_native_result() {
    let mut req = request(include_str!("../../../fixtures/lathe/first-program.nc"));
    req.source_revision = 1;
    let mut expected: Value = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/first-program.result.json"
    ))
    .unwrap();
    let mut actual = serde_json::to_value(compile(&req)).unwrap();
    for (a, e) in actual["motions"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .zip(expected["motions"].as_array_mut().unwrap().iter_mut())
    {
        let a_length = a
            .as_object_mut()
            .unwrap()
            .remove("lengthMm")
            .unwrap()
            .as_f64()
            .unwrap();
        let e_length = e
            .as_object_mut()
            .unwrap()
            .remove("lengthMm")
            .unwrap()
            .as_f64()
            .unwrap();
        assert!((a_length - e_length).abs() < 1e-9);
    }
    assert_eq!(actual, expected);
}

#[test]
fn code_lexemes_cannot_round_into_supported_integers() {
    for source in [
        "G1.00000000000000001 X10 F100",
        "M30.000000000000001",
        "G-0 X1",
        "G+0 X1",
        "N+1 G00 X1",
        "M+30",
        "G1.0 X10 F100",
        "N1.00000000000000001 G00 X10",
    ] {
        let r = compile(&request(source));
        assert!(!r.executable, "{source}");
        assert!(r.motions.is_empty() && r.blocks.is_empty());
    }
}

#[test]
fn review_boundary_cases_preserve_atomicity_and_precise_grammar() {
    let source = format!(
        "{}; comentario\n\n(fin sin código)",
        "G00 X1\n".repeat(MAX_BLOCKS)
    );
    let result = compile(&request(&source));
    assert!(result.executable);
    assert_eq!(result.blocks.len(), MAX_BLOCKS);
    for source in ["G. X10", "G-. X10", "X."] {
        let result = compile(&request(source));
        assert!(!result.executable);
        assert_eq!(result.diagnostics[0].code, "MISSING_NUMBER");
        assert_eq!(result.diagnostics[0].span.column_start, 1);
        assert_eq!(
            result.diagnostics[0].span.column_end,
            source.find(' ').unwrap_or(source.len()) + 1
        );
    }
    assert!(compile(&request("G00 X.5 Z+.5")).executable);
    let mut req = request("G00 X10");
    req.setup.tool_id = "not-supported".into();
    let result = compile(&req);
    assert!(!result.executable && result.motions.is_empty());
    assert_eq!(result.diagnostics[0].code, "INVALID_REQUEST");
}
