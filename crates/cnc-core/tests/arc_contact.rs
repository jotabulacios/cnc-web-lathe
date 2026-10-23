use cnc_core::*;

fn profile(source: &str) -> StockProfileV2 {
    profile_with_length(source, 100.0)
}

fn profile_with_length(source: &str, length_mm: f64) -> StockProfileV2 {
    let mut request = CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 3,
        source: source.into(),
        setup: serde_json::from_str(include_str!("../../../fixtures/lathe/setup.json")).unwrap(),
    };
    request.setup.stock.length_mm = length_mm;
    let program = compile(&request);
    assert!(program.executable, "{:?}", program.diagnostics);
    profile_at_v2(&program, &request.setup.stock, program.blocks.len())
}

#[test]
fn a_sub_chord_tolerance_arc_cannot_hide_material_from_the_spindle_check() {
    let result = profile("G00 X50.01 Z0\nG02 X50.01 Z-0.02 I0 K-0.01 F100");
    assert!(!result.complete);
    assert_eq!(result.evaluated_blocks, 1);
    assert_eq!(result.diagnostics[0].code, "SPINDLE_OFF");
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}

#[test]
fn an_unrepresentable_small_cut_freezes_the_whole_block_even_with_a_spindle() {
    let result = profile("S900 M03\nG00 X50.01 Z0\nG02 X50.01 Z-0.02 I0 K-0.01 F100");
    assert!(!result.complete);
    assert_eq!(result.evaluated_blocks, 2);
    assert_eq!(result.diagnostics[0].code, "PROFILE_NUMERICAL_AMBIGUITY");
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}

#[test]
fn a_small_upper_semicircle_in_air_does_not_require_a_spindle() {
    let result = profile("G00 X50.01 Z0\nG03 X50.01 Z-0.02 I0 K-0.01 F100");
    assert!(result.complete, "{:?}", result.diagnostics);
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}

#[test]
fn inward_arcs_toward_positive_z_still_diagnose_material() {
    let result = profile("S900 M03\nG00 X50.01 Z-0.02\nG03 X50.01 Z0 I0 K0.01 F100");
    assert!(!result.complete);
    assert_eq!(result.evaluated_blocks, 2);
    assert_eq!(result.diagnostics[0].code, "UNSUPPORTED_PROFILE_CUT");
}

#[test]
fn an_interior_tangent_is_contact_or_explicit_ambiguity_never_a_cut() {
    let result = profile("G00 X50.02 Z0\nG02 X50.02 Z-0.02 I0 K-0.01 F100");
    assert!(result.complete || result.diagnostics[0].code == "PROFILE_NUMERICAL_AMBIGUITY");
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}

#[test]
fn true_arc_extrema_are_checked_against_a_sloping_previously_cut_profile() {
    // The cone is r=25+z near its front. The lower semicircle's minimum
    // difference from that line occurs off its radial midpoint, at z≈-0.00293.
    // Both endpoints and the single display chord are above the cone.
    let result = profile(
        "S900 M03\nG00 X50 Z0\nG01 X30 Z-10 F100\nG00 X60\nG00 Z0\nG00 X50.005\nM05\nG02 X50.005 Z-0.02 I0 K-0.01",
    );
    assert!(!result.complete);
    assert_eq!(result.evaluated_blocks, 7);
    assert_eq!(result.diagnostics[0].code, "SPINDLE_OFF");
    // Failed arc does not change the earlier cone.
    let cone = result.spans.iter().find(|s| s.z_start_mm == -10.0).unwrap();
    assert_eq!(cone.r_start_mm, 15.0);
    assert_eq!(cone.r_end_mm, 25.0);
}

#[test]
fn a_circle_minimum_outside_stock_does_not_imply_removal_inside_stock() {
    let result = profile("G00 X50.01 Z0.0195\nG02 X50.01 Z-0.0005 I0 K-0.01 F100");
    assert!(result.complete, "{:?}", result.diagnostics);
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}

#[test]
fn repeating_a_lower_arc_does_not_silently_discard_the_residual_of_its_chords() {
    let first = "S900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nG00 X60\nG00 Z0";
    let before = profile(first);
    assert!(before.complete);
    for (spindle, code) in [
        ("M05", "SPINDLE_OFF"),
        ("S900 M03", "PROFILE_NUMERICAL_AMBIGUITY"),
    ] {
        let repeated = profile(&format!("{first}\n{spindle}\nG02 X40 Z-10 I0 K-10 F100"));
        assert!(!repeated.complete);
        assert_eq!(repeated.diagnostics[0].code, code);
        assert_eq!(repeated.evaluated_blocks, 6);
        assert_eq!(repeated.spans, before.spans);
    }
}

#[test]
fn a_display_chord_in_stock_does_not_turn_a_true_air_arc_into_a_cut() {
    // The stock occupies only [-0.005, 0]. The upper semicircle stays above
    // r25 throughout that interval, while its one display chord is r24.995.
    let result = profile_with_length(
        "G00 X49.99 Z0.005\nG03 X49.99 Z-0.015 I0 K-0.01 F100",
        0.005,
    );
    assert!(result.complete, "{:?}", result.diagnostics);
    assert_eq!(result.spans.len(), 1);
    assert_eq!(result.spans[0].r_start_mm, 25.0);
}
