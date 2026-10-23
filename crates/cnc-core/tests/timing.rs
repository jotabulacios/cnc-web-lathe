use cnc_core::*;
use std::f64::consts::PI;

fn request(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 21,
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

fn close(a: f64, b: f64, rel: f64) {
    assert!((a - b).abs() <= b.abs() * rel, "{a} vs {b}");
}

#[test]
fn g98_feed_and_rapids_give_the_hand_computed_time() {
    let program = compile_v2(&request(
        "S1000 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30",
    ));
    assert!(program.executable, "{:?}", program.diagnostics);
    let times: Vec<f64> = program.motions.iter().map(|m| m.time_s.unwrap()).collect();
    // Rapid (30,5)→(23,2): √(49+9) mm at 5000 mm/min.
    close(times[0], 58f64.sqrt() / RAPID_MM_MIN * 60.0, 1e-12);
    close(times[1], 32.0 / 100.0 * 60.0, 1e-12);
    close(program.estimated_time_s.unwrap(), times.iter().sum(), 1e-12);
    assert_eq!(program.motions[1].feed_mm_min, Some(100.0));
    assert_eq!(program.motions[1].feed_mm_rev, None);
}

#[test]
fn g99_feed_per_revolution_uses_the_spindle_speed() {
    let program = compile_v2(&request(
        "G99\nS1000 M03\nG00 X46 Z2\nG01 Z-30 F0.2\nG00 X60 Z5\nM30",
    ));
    assert!(program.executable, "{:?}", program.diagnostics);
    let cut = &program.motions[1];
    assert_eq!((cut.feed_mm_min, cut.feed_mm_rev), (None, Some(0.2)));
    // 0.2 mm/rev × 1000 rpm = 200 mm/min over 32 mm.
    close(cut.time_s.unwrap(), 32.0 / 200.0 * 60.0, 1e-12);
    assert!(program.blocks[0].after_state.feed_per_rev);
}

#[test]
fn g96_constant_surface_speed_tracks_the_diameter_and_obeys_g50() {
    let source =
        "G50 S3000\nG96 S150 M03\nG99\nG00 X50 Z0\nG01 X10 F0.1\nG97 S800\nG00 X60 Z5\nM30";
    let program = compile_v2(&request(source));
    assert!(program.executable, "{:?}", program.diagnostics);
    let at = |line: usize| {
        &program
            .blocks
            .iter()
            .find(|b| b.span.line == line)
            .unwrap()
            .after_state
    };
    // n = 1000·Vc / (π·D): Ø50 → 954.93 rpm; Ø10 → 4774.6, limited by G50 to 3000.
    close(at(4).spindle_rpm, 1000.0 * 150.0 / (PI * 50.0), 1e-12);
    assert_eq!(at(5).spindle_rpm, 3000.0);
    assert_eq!(at(5).css_m_min, Some(150.0));
    assert_eq!((at(6).css_m_min, at(6).spindle_rpm), (None, 800.0));
    // Facing R25→R5 at 0.1 mm/rev. Above r_c the time is ∫2πr dr/(F·1000·Vc);
    // below r_c (where n hits 3000) it is Δr/(F·3000). Minutes → seconds.
    let (f, vc, max) = (0.1, 150.0, 3000.0);
    let rc = 1000.0 * vc / (2.0 * PI * max);
    let analytic =
        (PI * (25.0f64.powi(2) - rc * rc) / (f * 1000.0 * vc) + (rc - 5.0) / (f * max)) * 60.0;
    let facing = program
        .motions
        .iter()
        .find(|m| m.kind == MotionKind::Linear)
        .unwrap();
    close(facing.time_s.unwrap(), analytic, 2e-3);
}

#[test]
fn spindle_programming_errors_are_explicit() {
    for (source, code) in [
        ("G96 S150 M03\nG00 X50 Z0\nM30", "CSS_NO_LIMIT"),
        ("G50 X10 S3000\nM30", "UNSUPPORTED_CODE"),
        ("G50\nM30", "INVALID_SPINDLE"),
        ("G50 S2000\nG96 S0 M03\nM30", "INVALID_SPINDLE"),
        (
            "G99\nG00 X46 Z2\nG01 Z-30 F0.2\nM30",
            "FEED_PER_REV_SPINDLE",
        ),
    ] {
        let result = compile_v2(&request(source));
        assert!(!result.executable, "{code}");
        assert!(
            result.diagnostics.iter().any(|d| d.code == code),
            "{code}: {:?}",
            result.diagnostics
        );
    }
    let mut legacy = request("G50 S3000\nG96 S150 M03\nM30");
    legacy.api_version = 1;
    legacy.dialect = "edu-lathe-v1".into();
    let result = compile(&legacy);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "UNSUPPORTED_CODE")
    );
    assert!(result.estimated_time_s.is_none());
}

#[test]
fn css_profile_still_requires_a_running_spindle_and_cuts_normally() {
    let source = "G50 S2500\nG96 S180 M03\nG00 X46 Z2\nG01 Z-30 F120\nG00 X60 Z5\nM30";
    let req = request(source);
    let blocks = compile_v2(&req).blocks.len();
    let LabProfile::Exterior(profile) = lab_profile_at(&req, 0.0, blocks) else {
        panic!()
    };
    assert!(profile.complete, "{:?}", profile.diagnostics);
    let last = profile.spans.last().unwrap();
    assert_eq!((last.r_start_mm, last.r_end_mm), (23.0, 23.0));
}
