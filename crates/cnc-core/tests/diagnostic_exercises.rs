use cnc_core::*;
fn program(source: &str) -> CompileRequest {
    CompileRequest {
        api_version: 1,
        dialect: DIALECT.into(),
        source_revision: 23,
        source: source.into(),
        setup: serde_json::from_value(
            serde_json::from_str::<serde_json::Value>(include_str!(
                "../../../fixtures/lathe/diagnostic-corrections.json"
            ))
            .unwrap()[0]["setup"]
                .clone(),
        )
        .unwrap(),
    }
}
#[test]
fn diagnostic_fixtures_have_exact_provenance_and_keep_the_last_trusted_material() {
    let catalogue: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/diagnostic-exercises.json"
    ))
    .unwrap();
    assert_eq!(catalogue.as_array().unwrap().len(), 2);
    for item in catalogue.as_array().unwrap() {
        let source = match item["id"].as_str().unwrap() {
            "diagnose-spindle" => include_str!("../../../fixtures/lathe/diagnostic-spindle-off.nc"),
            "diagnose-unsupported" => {
                include_str!("../../../fixtures/lathe/diagnostic-unsupported.nc")
            }
            _ => panic!("uncovered diagnostic fixture"),
        };
        let mut request = program(source);
        request.setup = serde_json::from_value(item["setup"].clone()).unwrap();
        let result = compile(&request);
        let want = &item["diagnostic"];
        if want["stage"] == "compile" {
            assert!(!result.executable);
            assert!(result.motions.is_empty());
            assert!(result.final_state.is_none());
            assert_eq!(result.diagnostics.len(), 1);
            let actual = serde_json::to_value(&result.diagnostics[0]).unwrap();
            for key in ["code", "severity", "span"] {
                assert_eq!(actual[key], want[key]);
            }
        } else {
            assert!(result.executable);
            assert_eq!(result.blocks.len(), 7);
            let failed = want["failedAtBlock"].as_u64().unwrap() as usize;
            for cursor in 0..=result.blocks.len() {
                let profile = profile_at_v2(&result, &request.setup.stock, cursor);
                assert_eq!(profile.complete, cursor < failed);
                assert_eq!(profile.evaluated_blocks, cursor.min(failed - 1));
                assert_eq!(profile.spans.len(), 1);
                let span = &profile.spans[0];
                assert_eq!(
                    (
                        span.z_start_mm,
                        span.z_end_mm,
                        span.r_start_mm,
                        span.r_end_mm
                    ),
                    (-100., 0., 25., 25.)
                );
                if cursor >= failed {
                    assert_eq!(profile.diagnostics.len(), 1);
                    let actual = serde_json::to_value(&profile.diagnostics[0]).unwrap();
                    for key in ["code", "severity", "span"] {
                        assert_eq!(actual[key], want[key]);
                    }
                }
            }
        }
    }
}
#[test]
fn corrected_spindle_example_matches_the_independent_cylinder_volume() {
    let request = program(include_str!(
        "../../../fixtures/lathe/diagnostic-spindle-fixed.nc"
    ));
    let result = compile(&request);
    assert!(result.executable);
    assert_eq!(result.blocks.len(), 8);
    let state = result.final_state.as_ref().unwrap();
    assert!(state.ended && !state.spindle_on);
    assert_eq!(state.tool_id.as_deref(), Some("roughing-od"));
    let profile = profile_at_v2(&result, &request.setup.stock, 8);
    assert!(profile.complete);
    let actual: Vec<_> = profile
        .spans
        .iter()
        .map(|p| (p.z_start_mm, p.z_end_mm, p.r_start_mm, p.r_end_mm))
        .collect();
    assert_eq!(actual, vec![(-100., -20., 25., 25.), (-20., 0., 20., 20.)]);
    let volume: f64 = profile
        .spans
        .iter()
        .map(|s| {
            std::f64::consts::PI
                * (s.z_end_mm - s.z_start_mm)
                * (s.r_start_mm.powi(2) + s.r_start_mm * s.r_end_mm + s.r_end_mm.powi(2))
                / 3.
        })
        .sum();
    assert!((volume - 58000. * std::f64::consts::PI).abs() < 1e-7);
}
