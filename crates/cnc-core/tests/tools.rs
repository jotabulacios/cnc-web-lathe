use cnc_core::*;

fn req(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 1,
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

#[test]
fn four_digit_and_two_digit_tool_calls_map_to_standard_catalogue() {
    let cases = [
        ("T0000", "generic-od"),
        ("T0", "generic-od"),
        ("T00", "generic-od"),
        ("T0101", "roughing-od"),
        ("T01", "roughing-od"),
        ("T1", "roughing-od"),
        ("T0202", "finishing-od"),
        ("T02", "finishing-od"),
        ("T2", "finishing-od"),
        ("T0303", "grooving-od"),
        ("T03", "grooving-od"),
        ("T3", "grooving-od"),
        ("T0404", "facing-od"),
        ("T04", "facing-od"),
        ("T4", "facing-od"),
    ];

    for (code, expected_tool) in cases {
        let prog = format!("G21 G18 G98\n{code}\nG00 X50 Z2\nM30");
        let result = compile(&req(&prog));
        assert!(
            result.executable,
            "Failed on {code}: {:?}",
            result.diagnostics
        );
        assert_eq!(result.blocks.len(), 4);
        assert_eq!(
            result.blocks[1].after_state.tool_id.as_deref(),
            Some(expected_tool),
            "Block state failed on {code}"
        );
        assert_eq!(
            result.motions[0].tool_id, expected_tool,
            "Motion tool_id failed on {code}"
        );
    }
}

#[test]
fn m06_and_tool_combinations_operate_seamlessly() {
    // T with M06
    let r1 = compile(&req("G21 G18 G98\nT0101 M06\nG00 X40 Z0\nM30"));
    assert!(r1.executable, "{:?}", r1.diagnostics);
    assert_eq!(r1.motions[0].tool_id, "roughing-od");

    // M06 with T (inverted order)
    let r2 = compile(&req("G21 G18 G98\nM06 T0202\nG00 X40 Z0\nM30"));
    assert!(r2.executable, "{:?}", r2.diagnostics);
    assert_eq!(r2.motions[0].tool_id, "finishing-od");

    // M06 alone (confirms current tool without error)
    let r3 = compile(&req("G21 G18 G98\nM06\nG00 X40 Z0\nM30"));
    assert!(r3.executable, "{:?}", r3.diagnostics);
    assert_eq!(r3.motions[0].tool_id, "generic-od");
}

#[test]
fn sequential_tool_changes_persist_modally_across_motions() {
    let prog = r#"G21 G18 G98
T0101 (Desbaste)
S1000 M03
G00 X50 Z2
G01 Z-20 F120
G00 X60 Z5
T0202 (Acabado)
G00 X48 Z2
G01 Z-20 F80
G00 X60 Z5
T0 (Neutro)
M05
M30"#;

    let result = compile(&req(prog));
    assert!(result.executable, "{:?}", result.diagnostics);
    assert_eq!(result.motions.len(), 6);

    // First 3 motions use roughing-od
    assert_eq!(result.motions[0].tool_id, "roughing-od");
    assert_eq!(result.motions[1].tool_id, "roughing-od");
    assert_eq!(result.motions[2].tool_id, "roughing-od");

    // Next 3 motions use finishing-od
    assert_eq!(result.motions[3].tool_id, "finishing-od");
    assert_eq!(result.motions[4].tool_id, "finishing-od");
    assert_eq!(result.motions[5].tool_id, "finishing-od");

    // Final state has neutral tool
    assert_eq!(
        result.final_state.unwrap().tool_id.as_deref(),
        Some("generic-od")
    );
}

#[test]
fn setup_with_non_default_tool_propagates_until_overridden() {
    let mut request = req("G21 G18 G98\nG00 X40 Z2\nT0303\nG00 X30 Z0\nM30");
    request.setup.tool_id = "facing-od".into();
    let result = compile(&request);
    assert!(result.executable, "{:?}", result.diagnostics);

    // Initial state and first motion inherit facing-od
    assert_eq!(result.initial_state.tool_id.as_deref(), Some("facing-od"));
    assert_eq!(result.motions[0].tool_id, "facing-od");

    // Second motion switches to grooving-od
    assert_eq!(result.motions[1].tool_id, "grooving-od");
}

#[test]
fn invalid_tool_words_emit_precise_diagnostics_and_block_execution() {
    let invalid_cases = [
        ("T0102", "INVALID_TOOL_OFFSET"),
        ("T0201", "INVALID_TOOL_OFFSET"),
        ("T0001", "INVALID_TOOL_OFFSET"),
        ("T0004", "INVALID_TOOL_OFFSET"),
        ("T0100", "INVALID_TOOL_OFFSET"),
        ("T101", "INVALID_TOOL_NUMBER"),
        ("T00101", "INVALID_TOOL_NUMBER"),
        ("T000", "INVALID_TOOL_NUMBER"),
        ("T+1", "INVALID_TOOL_NUMBER"),
        ("T-0", "INVALID_TOOL_NUMBER"),
        ("T1.00000000000000001", "INVALID_TOOL_NUMBER"),
        ("T0505", "UNSUPPORTED_TOOL"),
        ("T5", "UNSUPPORTED_TOOL"),
        ("T9999", "UNSUPPORTED_TOOL"),
        ("T10000", "INVALID_TOOL_NUMBER"),
        ("T1.5", "INVALID_TOOL_NUMBER"),
        ("T-1", "INVALID_TOOL_NUMBER"),
        ("T0101 T0202", "DUPLICATE_WORD"),
        ("M06 M06", "MODAL_CONFLICT"),
    ];

    for (code, expected_diag) in invalid_cases {
        let prog = format!("G21 G18 G98\n{code}\nG00 X50 Z2\nM30");
        let result = compile(&req(&prog));
        assert!(
            !result.executable,
            "Expected failure for {code}, but was executable"
        );
        assert!(
            result.motions.is_empty(),
            "Motions should be empty for {code}"
        );
        assert!(
            result.diagnostics.iter().any(|d| d.code == expected_diag),
            "Expected diagnostic {expected_diag} for {code}, got: {:?}",
            result.diagnostics
        );
    }
}
