use cnc_core::*;
use std::f64::consts::PI;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 11,
        source: source.into(),
        setup: serde_json::from_str(include_str!("../../../fixtures/lathe/setup.json")).unwrap(),
    }
}

fn close(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() <= 1e-9
}

fn diagnostic_codes(source: &str) -> Vec<String> {
    let result = compile(&request(source));
    assert!(!result.executable, "el programa debía fallar: {source}");
    assert!(result.blocks.is_empty());
    assert!(result.motions.is_empty());
    result.diagnostics.iter().map(|d| d.code.clone()).collect()
}

#[test]
fn g03_convex_arc_resolves_center_radius_sweep_and_arc_length() {
    let program = "G21 G18 G98\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nM30";
    let result = compile(&request(program));
    assert!(result.executable, "{:?}", result.diagnostics);
    let motion = &result.motions[1];
    assert_eq!(motion.kind, MotionKind::ArcCcw);
    assert_eq!(
        motion.from,
        Position {
            r_mm: 20.0,
            z_mm: 0.0
        }
    );
    assert_eq!(
        motion.to,
        Position {
            r_mm: 10.0,
            z_mm: -10.0
        }
    );
    let arc = motion.arc.expect("el arco debe llevar geometría");
    assert_eq!(
        arc.center,
        Position {
            r_mm: 10.0,
            z_mm: 0.0
        }
    );
    assert!(close(arc.radius_mm, 10.0));
    assert!(!arc.clockwise);
    assert!(close(arc.sweep_rad, PI / 2.0));
    assert!(close(motion.length_mm, 5.0 * PI));
    assert_eq!(motion.feed_mm_min, Some(100.0));
    assert_eq!(
        result.blocks[3].after_state.motion,
        Some(MotionKind::ArcCcw)
    );
}

#[test]
fn g02_concave_fillet_is_clockwise_and_keeps_positive_radius() {
    let program = "G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30";
    let result = compile(&request(program));
    assert!(result.executable, "{:?}", result.diagnostics);
    let arc = result.motions[1].arc.expect("arco");
    assert_eq!(
        arc.center,
        Position {
            r_mm: 30.0,
            z_mm: -10.0
        }
    );
    assert!(arc.clockwise);
    assert!(close(arc.sweep_rad, PI / 2.0));
    assert!(close(result.motions[1].length_mm, 5.0 * PI));
}

#[test]
fn a_semicircle_touching_the_axis_at_both_ends_is_accepted() {
    let program = "G21 G18 G98\nS900 M03\nG00 X0 Z0\nG03 X0 Z-20 I0 K-10 F100\nM30";
    let result = compile(&request(program));
    assert!(result.executable, "{:?}", result.diagnostics);
    let motion = &result.motions[1];
    let arc = motion.arc.expect("arco");
    assert!(close(arc.sweep_rad, PI));
    assert!(close(motion.length_mm, 10.0 * PI));
    assert_eq!(
        motion.to,
        Position {
            r_mm: 0.0,
            z_mm: -20.0
        }
    );
}

#[test]
fn arc_modality_persists_while_i_and_k_are_not_modal() {
    let program = "G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nG01 X20 Z-20\nM30";
    let result = compile(&request(program));
    assert!(result.executable, "{:?}", result.diagnostics);
    assert_eq!(result.motions[1].kind, MotionKind::ArcCw);
    assert_eq!(result.motions[2].kind, MotionKind::Linear);
    assert!(result.motions[2].arc.is_none());
    assert_eq!(result.blocks[3].after_state.motion, Some(MotionKind::ArcCw));
    assert_eq!(
        result.blocks[4].after_state.motion,
        Some(MotionKind::Linear)
    );
}

#[test]
fn a_following_block_without_g_still_requires_a_center() {
    let codes = diagnostic_codes("G00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nX20 Z-20");
    assert_eq!(codes, vec!["MISSING_ARC_CENTER"]);
}

#[test]
fn arcs_require_center_words_and_feed() {
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 X20 Z-10 F100"),
        vec!["MISSING_ARC_CENTER"]
    );
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 X20 Z-10 I-10 K0"),
        vec!["MISSING_FEED"]
    );
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 X20 Z-10 I0 K0 F100"),
        vec!["INVALID_ARC_CENTER"]
    );
}

#[test]
fn arcs_reject_mismatched_endpoints_and_full_circles() {
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 X30 Z-10 I-10 K0 F100"),
        vec!["ARC_RADIUS_MISMATCH"]
    );
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 X40 Z0 I-10 K0 F100"),
        vec!["DEGENERATE_ARC"]
    );
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG02 I-10 K0 F100"),
        vec!["DEGENERATE_ARC"]
    );
}

#[test]
fn arc_words_are_rejected_outside_arc_blocks() {
    assert_eq!(
        diagnostic_codes("G00 X40 Z0 I-10"),
        vec!["UNEXPECTED_ARC_WORD"]
    );
    assert_eq!(
        diagnostic_codes("G00 X40 Z0\nG01 X20 Z-10 I-5 F100"),
        vec!["UNEXPECTED_ARC_WORD"]
    );
}

#[test]
fn an_arc_that_crosses_the_spindle_axis_is_rejected() {
    assert_eq!(
        diagnostic_codes("G00 X0 Z10\nG02 X0 Z-10 I0 K-10 F100"),
        vec!["POSITION_RANGE"]
    );
}

#[test]
fn arc_errors_block_the_whole_interpreter_atomically() {
    let result = compile(&request(
        "G00 X40 Z0\nG03 X30 Z-10 I-10 K0 F100\nG01 X10 Z-20\nM30",
    ));
    assert!(!result.executable);
    assert!(result.blocks.is_empty());
    assert!(result.motions.is_empty());
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "ARC_RADIUS_MISMATCH")
    );
    assert_eq!(result.diagnostics[0].span.line, 2);
}

fn radius_at(spans: &[cnc_core::linear_profile::LinearProfileSpan], z: f64) -> Option<f64> {
    spans
        .iter()
        .find(|span| span.z_start_mm <= z && z <= span.z_end_mm)
        .map(|span| {
            if z == span.z_start_mm {
                span.r_start_mm
            } else if z == span.z_end_mm {
                span.r_end_mm
            } else {
                let t = (z - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
                span.r_start_mm * (1.0 - t) + span.r_end_mm * t
            }
        })
}

fn solid_volume(spans: &[cnc_core::linear_profile::LinearProfileSpan]) -> f64 {
    spans
        .iter()
        .map(|span| {
            let (a, b) = (span.r_start_mm, span.r_end_mm);
            PI * (span.z_end_mm - span.z_start_mm) * (a * a + a * b + b * b) / 3.0
        })
        .sum()
}

#[test]
fn v2_flattens_a_monotonic_arc_within_the_documented_chord_tolerance() {
    let program = "G21 G18 G98\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nM30";
    let request = request(program);
    let result = compile(&request);
    assert!(result.executable, "{:?}", result.diagnostics);
    let stock = request.setup.stock.clone();

    let v2 = profile_at_v2(&result, &stock, 5);
    assert!(v2.complete, "{:?}", v2.diagnostics);
    assert!(v2.diagnostics.is_empty());
    assert_eq!(v2.evaluated_blocks, 5);
    // Contiguous, strictly ordered, non-negative.
    assert_eq!(v2.spans.first().unwrap().z_start_mm, -100.0);
    assert_eq!(v2.spans.last().unwrap().z_end_mm, 0.0);
    for pair in v2.spans.windows(2) {
        assert_eq!(pair[0].z_end_mm, pair[1].z_start_mm);
    }
    for span in &v2.spans {
        assert!(span.z_start_mm < span.z_end_mm);
        assert!(span.r_start_mm >= 0.0 && span.r_end_mm >= 0.0);
    }
    // Every chord stays within the documented sagitta of the circle, measured
    // geometrically (not along a single axis: near a vertical tangent the
    // radial coordinate changes faster than the perpendicular error).
    let mut chords = 0;
    for span in v2.spans.iter().filter(|span| span.z_start_mm >= -10.0) {
        chords += 1;
        for k in 0..=20 {
            let t = k as f64 / 20.0;
            let z = span.z_start_mm + t * (span.z_end_mm - span.z_start_mm);
            let r = span.r_start_mm + t * (span.r_end_mm - span.r_start_mm);
            let distance = (z * z + (r - 10.0) * (r - 10.0)).sqrt();
            assert!(
                distance <= 10.0 + 1e-9 && 10.0 - distance <= ARC_CHORD_TOLERANCE_MM + 1e-9,
                "z={z}: distancia al centro {distance}"
            );
        }
    }
    assert!(
        chords > 8,
        "el arco debe aplanarse en varios tramos: {chords}"
    );
    // The chord error is bounded, so the simulated solid stays close to the
    // analytic value; the direction depends on whether the arc is convex or concave.
    let removed_area = 6250.0 - 5000.0 / 3.0 - 500.0 * PI;
    let stock_volume = PI * 62500.0;
    let expected = stock_volume - PI * removed_area;
    let simulated = solid_volume(&v2.spans);
    assert!(
        (simulated - expected).abs() / stock_volume < 2e-4,
        "sólido simulado {simulated}, exacto {expected}"
    );

    // Legacy v1 keeps constant-radius spans and still freezes at the arc.
    let v1 = profile_at(&result, &stock, 5);
    assert!(!v1.complete);
    assert_eq!(v1.evaluated_blocks, 3);
    assert_eq!(v1.diagnostics[0].code, "ARC_IN_PROFILE");
    assert_eq!(v1.spans.len(), 1);
    assert_eq!(v1.spans[0].radius_mm, 25.0);
}

#[test]
fn v2_flattens_a_concave_fillet_and_keeps_cutting_after_it() {
    let program = "G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nG01 X20 Z-20\nM30";
    let request = request(program);
    let result = compile(&request);
    assert!(result.executable, "{:?}", result.diagnostics);
    let v2 = profile_at_v2(&result, &request.setup.stock, 6);
    assert!(v2.complete, "{:?}", v2.diagnostics);
    assert!(v2.diagnostics.is_empty());
    // Circle center (r=30, z=-10), R=10; below z=-1.34 the arc is the binding
    // surface. Check the geometric chord error against the center.
    let mut chords = 0;
    for span in v2
        .spans
        .iter()
        .filter(|span| span.z_start_mm >= -10.0 && span.z_end_mm <= -2.0)
    {
        chords += 1;
        for k in 0..=20 {
            let t = k as f64 / 20.0;
            let z = span.z_start_mm + t * (span.z_end_mm - span.z_start_mm);
            let r = span.r_start_mm + t * (span.r_end_mm - span.r_start_mm);
            let distance = ((z + 10.0) * (z + 10.0) + (r - 30.0) * (r - 30.0)).sqrt();
            assert!(
                distance <= 10.0 + 1e-9 && 10.0 - distance <= ARC_CHORD_TOLERANCE_MM + 1e-9,
                "z={z}: distancia al centro {distance}"
            );
        }
    }
    assert!(
        chords > 4,
        "el filete debe aplanarse en varios tramos: {chords}"
    );
    // The following G01 still removes material: a cone from r=20 at z=-10 to r=10 at z=-20.
    assert!((radius_at(&v2.spans, -15.0).unwrap() - 15.0).abs() < 1e-9);
    assert!((radius_at(&v2.spans, -30.0).unwrap() - 25.0).abs() < 1e-9);
}

#[test]
fn v2_rejects_a_non_monotonic_arc_instead_of_inventing_spans() {
    // 270° clockwise: z goes 0 -> -20 -> -10, so it cannot be a z -> r profile.
    let program = "G21 G18 G98\nS900 M03\nG00 X20 Z0\nG02 X40 Z-10 I0 K-10 F100\nM30";
    let request = request(program);
    let result = compile(&request);
    assert!(result.executable, "{:?}", result.diagnostics);
    let v2 = profile_at_v2(&result, &request.setup.stock, 5);
    assert!(!v2.complete);
    assert_eq!(v2.evaluated_blocks, 3);
    assert_eq!(v2.diagnostics[0].code, "ARC_IN_PROFILE");
    assert_eq!(v2.diagnostics[0].span.line, 4);
    assert_eq!(v2.spans.len(), 1);
    assert_eq!(v2.spans[0].r_start_mm, 25.0);
}

#[test]
fn an_arc_in_the_air_keeps_the_profile_complete_and_unchanged() {
    let program = "G21 G18 G98\nS900 M03\nG00 X60 Z0\nG03 X52 Z-4 I-4 K0 F100\nM30";
    let request = request(program);
    let result = compile(&request);
    assert!(result.executable, "{:?}", result.diagnostics);
    let v2 = profile_at_v2(&result, &request.setup.stock, 5);
    assert!(v2.complete, "{:?}", v2.diagnostics);
    assert!(v2.diagnostics.is_empty());
    assert_eq!(v2.spans.len(), 1);
    assert_eq!(v2.spans[0].z_start_mm, -100.0);
    assert_eq!(v2.spans[0].z_end_mm, 0.0);
    assert_eq!(v2.spans[0].r_start_mm, 25.0);
    assert_eq!(v2.spans[0].r_end_mm, 25.0);
}

#[test]
fn arc_flattening_is_deterministic_across_repeated_prefixes() {
    let program = "G21 G18 G98\nS900 M03\nG00 X60 Z0\nG02 X40 Z-10 I0 K-10 F100\nG01 X20 Z-20\nM30";
    let request = request(program);
    let result = compile(&request);
    let first = profile_at_v2(&result, &request.setup.stock, 6);
    let second = profile_at_v2(&result, &request.setup.stock, 6);
    assert_eq!(first.spans, second.spans);
    assert!(first.complete && second.complete);
}

#[test]
fn axis_endpoints_use_exact_radii_in_both_arc_directions() {
    for source in [
        "G00 X2 Z0\nG02 X0 Z-0.0710678118654755 K-7.0710678118654755 F100",
        "G00 X2 Z0\nG03 X0 Z0.0710678118654755 K7.0710678118654755 F100",
        "G00 X2 Z0\nG02 X0 Z-1 K-1 F100",
        "G00 X2 Z0\nG03 X0 Z1 K1 F100",
        "G00 X0 Z-0.0710678118654755\nG03 X2 Z0 I1 K-7 F100",
        "G00 X0 Z0.0710678118654755\nG02 X2 Z0 I1 K7 F100",
    ] {
        let result = compile(&request(source));
        assert!(result.executable, "{source}: {:?}", result.diagnostics);
        assert_eq!(result.motions.len(), 2);
        assert!(result.motions[1].from.r_mm >= 0.0);
        assert!(result.motions[1].to.r_mm >= 0.0);
    }
}

#[test]
fn an_interior_negative_radius_is_rejected_without_a_physical_epsilon() {
    for source in [
        "G00 X2 Z0\nG02 X2 Z-4 K-2 F100",
        "G00 X2 Z0\nG03 X2 Z4 K2 F100",
        "G00 X2 Z0\nG02 X2 Z-2.000000000002 K-1.000000000001 F100",
        "G00 X2 Z0\nG03 X2 Z2.000000000002 K1.000000000001 F100",
    ] {
        assert_eq!(diagnostic_codes(source), vec!["POSITION_RANGE"], "{source}");
    }
}
