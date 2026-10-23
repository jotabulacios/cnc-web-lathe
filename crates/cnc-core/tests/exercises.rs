use cnc_core::*;

fn close(actual: f64, expected: f64, tolerance: f64, context: &str) {
    assert!(
        actual.is_finite() && expected.is_finite() && tolerance.is_finite() && tolerance >= 0.0
    );
    assert!(
        (actual - expected).abs() <= tolerance,
        "{context}: got {actual}, expected {expected}, tolerance {tolerance}"
    );
}

/// Catalogue spans are either cylindrical (`radiusMm`) or conical (`rStartMm`/`rEndMm`).
fn expected_radii(spans: &serde_json::Value) -> Vec<(f64, f64, f64, f64)> {
    spans
        .as_array()
        .unwrap()
        .iter()
        .map(|span| {
            let radius = || span["radiusMm"].as_f64().unwrap();
            (
                span["zStartMm"].as_f64().unwrap(),
                span["zEndMm"].as_f64().unwrap(),
                span.get("rStartMm")
                    .map(|v| v.as_f64().unwrap())
                    .unwrap_or_else(radius),
                span.get("rEndMm")
                    .map(|v| v.as_f64().unwrap())
                    .unwrap_or_else(radius),
            )
        })
        .collect()
}

/// Independently check that each reconstruction still covers the whole stock domain.
fn validate_profile(profile: &StockProfileV2, stock: &Stock, tolerance: f64) {
    assert!(profile.complete, "{:?}", profile.diagnostics);
    assert!(profile.diagnostics.is_empty());
    assert!(!profile.spans.is_empty());
    let mut previous = -stock.length_mm;
    for span in &profile.spans {
        assert!(span.z_start_mm.is_finite() && span.z_end_mm.is_finite());
        assert!(span.z_start_mm < span.z_end_mm);
        close(span.z_start_mm, previous, tolerance, "contiguous domain");
        for radius in [span.r_start_mm, span.r_end_mm] {
            assert!(radius.is_finite() && radius >= 0.0 && radius <= stock.diameter_mm / 2.0);
        }
        previous = span.z_end_mm;
    }
    close(previous, 0.0, tolerance, "front face domain");
}

/// Contact at a shoulder uses the smaller of the adjacent one-sided radii.
/// Exact stock endpoints are valid; missing/out-of-domain samples must fail.
fn sample_radius(profile: &StockProfileV2, z: f64) -> f64 {
    assert!(z.is_finite());
    profile
        .spans
        .iter()
        .filter(|span| z >= span.z_start_mm && z <= span.z_end_mm)
        .map(|span| {
            let t = (z - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
            span.r_start_mm + t * (span.r_end_mm - span.r_start_mm)
        })
        .reduce(f64::min)
        .unwrap_or_else(|| panic!("No profile covers sample Z{z}"))
}

/// Exact integral of each linear radius segment, independent of engine volume code.
fn profile_volume(profile: &StockProfileV2) -> f64 {
    profile
        .spans
        .iter()
        .map(|span| {
            std::f64::consts::PI
                * (span.z_end_mm - span.z_start_mm)
                * (span.r_start_mm.powi(2)
                    + span.r_start_mm * span.r_end_mm
                    + span.r_end_mm.powi(2))
                / 3.0
        })
        .sum()
}

#[test]
fn guided_catalogue_programs_match_each_analytical_profile_and_finish_retracted() {
    let catalogue: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/lathe/exercises.json")).unwrap();
    assert_eq!(catalogue.as_array().unwrap().len(), 6);
    for exercise in catalogue.as_array().unwrap() {
        let source = match exercise["file"].as_str().unwrap() {
            "straight-turning.nc" => include_str!("../../../fixtures/lathe/straight-turning.nc"),
            "two-step-turning.nc" => include_str!("../../../fixtures/lathe/two-step-turning.nc"),
            "incremental-turning.nc" => {
                include_str!("../../../fixtures/lathe/incremental-turning.nc")
            }
            "taper-turning.nc" => include_str!("../../../fixtures/lathe/taper-turning.nc"),
            "arc-convex.nc" => include_str!("../../../fixtures/lathe/arc-convex.nc"),
            "facing-turning.nc" => include_str!("../../../fixtures/lathe/facing-turning.nc"),
            other => panic!("Fixture not covered by native catalogue test: {other}"),
        };
        let tolerance = exercise["toleranceMm"].as_f64().unwrap();
        let setup: Setup = serde_json::from_value(exercise["setup"].clone()).unwrap();
        let request = CompileRequest {
            api_version: 1,
            dialect: DIALECT.into(),
            source_revision: 37,
            source: source.into(),
            setup,
        };
        let result = compile(&request);
        assert!(
            result.executable,
            "{}: {:?}",
            exercise["id"], result.diagnostics
        );
        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result.blocks.len(),
            exercise["blockCount"].as_u64().unwrap() as usize
        );
        let final_state = result.final_state.as_ref().unwrap();
        assert!(final_state.ended);
        assert!(!final_state.spindle_on);
        if let Some(expected_tool) = exercise.get("expectedFinalToolId") {
            assert_eq!(
                final_state
                    .tool_id
                    .as_deref()
                    .unwrap_or(&request.setup.tool_id),
                expected_tool.as_str().unwrap(),
                "final tool"
            );
        }
        let expected: Position =
            serde_json::from_value(exercise["expectedFinalPosition"].clone()).unwrap();
        close(
            final_state.position.r_mm,
            expected.r_mm,
            tolerance,
            "final radius",
        );
        close(
            final_state.position.z_mm,
            expected.z_mm,
            tolerance,
            "final Z",
        );

        let legacy = matches!(
            exercise["id"].as_str().unwrap(),
            "straight" | "two-steps" | "incremental"
        );
        for cursor in 0..=result.blocks.len() {
            let profile = profile_at_v2(&result, &request.setup.stock, cursor);
            validate_profile(&profile, &request.setup.stock, tolerance);
            assert_eq!(profile.evaluated_blocks, cursor);
            assert_eq!(profile.completed_blocks, cursor);
            if legacy {
                let old = profile_at(&result, &request.setup.stock, cursor);
                assert!(old.complete, "{:?}", old.diagnostics);
                assert!(old.diagnostics.is_empty());
                assert_eq!(old.spans.len(), profile.spans.len());
                for (old, new) in old.spans.iter().zip(&profile.spans) {
                    close(old.z_start_mm, new.z_start_mm, tolerance, "v1/v2 Z start");
                    close(old.z_end_mm, new.z_end_mm, tolerance, "v1/v2 Z end");
                    close(
                        old.radius_mm,
                        new.r_start_mm,
                        tolerance,
                        "v1/v2 radius start",
                    );
                    close(old.radius_mm, new.r_end_mm, tolerance, "v1/v2 radius end");
                }
            }
            if cursor != result.blocks.len() {
                continue;
            }
            if let Some(expected) = exercise.get("expectedSpans") {
                let spans = expected_radii(expected);
                assert_eq!(
                    profile.spans.len(),
                    spans.len(),
                    "{} final span count",
                    exercise["id"]
                );
                for (actual, expected) in profile.spans.iter().zip(spans) {
                    close(actual.z_start_mm, expected.0, tolerance, "final Z start");
                    close(actual.z_end_mm, expected.1, tolerance, "final Z end");
                    close(
                        actual.r_start_mm,
                        expected.2,
                        tolerance,
                        "final radius start",
                    );
                    close(actual.r_end_mm, expected.3, tolerance, "final radius end");
                }
            } else {
                let expected = &exercise["expectedProfile"];
                for sample in expected["samples"].as_array().unwrap() {
                    close(
                        sample_radius(&profile, sample["zMm"].as_f64().unwrap()),
                        sample["radiusMm"].as_f64().unwrap(),
                        sample["toleranceMm"].as_f64().unwrap(),
                        "arc sample",
                    );
                }
                close(
                    profile_volume(&profile),
                    expected["volumeMm3"].as_f64().unwrap(),
                    expected["volumeToleranceMm3"].as_f64().unwrap(),
                    "analytical volume",
                );
                // The quarter-circle radius is r(Z)=10+sqrt(100-Z²), Z∈[-10,0].
                // Its exact integral plus untouched stock is π(56250+5000/3+500π).
                let pi = std::f64::consts::PI;
                close(
                    expected["volumeMm3"].as_f64().unwrap(),
                    pi * (56250.0 + 5000.0 / 3.0 + 500.0 * pi),
                    tolerance,
                    "catalogue analytic volume",
                );
                for z in [-10.0_f64, -8.0, -5.0, -2.0, 0.0] {
                    close(
                        sample_radius(&profile, z),
                        10.0 + (100.0 - z * z).sqrt(),
                        ARC_CHORD_TOLERANCE_MM * 2.0,
                        "independent circular radius",
                    );
                }
            }
        }
        if exercise["id"] == "incremental" {
            close(
                result.blocks[3].after_state.position.r_mm,
                20.0,
                tolerance,
                "U radius",
            );
            close(
                result.blocks[3].after_state.position.z_mm,
                2.0,
                tolerance,
                "U Z",
            );
            close(
                result.blocks[4].after_state.position.z_mm,
                -30.0,
                tolerance,
                "W Z",
            );
            close(
                result.blocks[5].after_state.position.r_mm,
                30.0,
                tolerance,
                "retract radius",
            );
        }
        if exercise["id"] == "taper" {
            close(
                result.blocks[3].after_state.position.r_mm,
                10.0,
                tolerance,
                "cone radius",
            );
            close(
                result.blocks[3].after_state.position.z_mm,
                -60.0,
                tolerance,
                "cone Z",
            );
        }
        if exercise["id"] == "facing-turning" {
            assert_eq!(
                result.blocks[1].after_state.tool_id.as_deref(),
                Some("facing-od")
            );
            assert_eq!(
                result.blocks[6].after_state.tool_id.as_deref(),
                Some("roughing-od")
            );
            assert_eq!(final_state.tool_id.as_deref(), Some("roughing-od"));
        }
    }
}
