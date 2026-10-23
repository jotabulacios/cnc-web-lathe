use cnc_core::{CompileRequest, Position, Setup, Stock, StockProfileV3, compile_v2, profile_at_v3};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Material {
    diameter_mm: f64,
    inner_diameter_mm: f64,
    length_mm: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExerciseSetup {
    x_convention: String,
    initial_position: Position,
    stock: Material,
    tool_id: String,
}

fn request(item: &Value, source: &str) -> (CompileRequest, f64) {
    let setup: ExerciseSetup = serde_json::from_value(item["setup"].clone()).unwrap();
    assert_eq!(setup.stock.diameter_mm, 50.0);
    assert_eq!(setup.stock.inner_diameter_mm, 20.0);
    assert_eq!(setup.stock.length_mm, 100.0);
    assert_eq!(setup.tool_id, "boring-id");
    let inner_diameter_mm = setup.stock.inner_diameter_mm;
    (
        CompileRequest {
            api_version: 2,
            dialect: "edu-lathe-v2".into(),
            source_revision: 41,
            source: source.into(),
            setup: Setup {
                x_convention: setup.x_convention,
                initial_position: setup.initial_position,
                // Material interior belongs to reconstruction, not an ignored
                // extension of the compiler's historical Stock contract.
                stock: Stock {
                    diameter_mm: setup.stock.diameter_mm,
                    length_mm: setup.stock.length_mm,
                },
                tool_id: setup.tool_id,
                tool_offsets: None,
            },
        },
        inner_diameter_mm,
    )
}

fn assert_untouched(profile: &StockProfileV3, expected: &Value) {
    assert_eq!(profile.spans.len(), 1);
    let span = &profile.spans[0];
    assert_eq!(
        (
            span.z_start_mm,
            span.z_end_mm,
            span.inner_start_mm,
            span.inner_end_mm,
            span.outer_start_mm,
            span.outer_end_mm
        ),
        (-100.0, 0.0, 10.0, 10.0, 25.0, 25.0)
    );
    let independent_volume = 100.0 * (25.0_f64.powi(2) - 10.0_f64.powi(2)) * std::f64::consts::PI;
    let tolerance = expected["volumeToleranceMm3"].as_f64().unwrap();
    assert!((expected["volumeMm3"].as_f64().unwrap() - independent_volume).abs() <= tolerance);
    assert!((profile.volume_mm3 - independent_volume).abs() <= tolerance);
    for sample in expected["samples"].as_array().unwrap() {
        let z = sample["zMm"].as_f64().unwrap();
        assert!(span.z_start_mm < z && z < span.z_end_mm);
        let radius_tolerance = sample["toleranceMm"].as_f64().unwrap();
        assert!((sample["innerRadiusMm"].as_f64().unwrap() - 10.0).abs() <= radius_tolerance);
        assert!((sample["outerRadiusMm"].as_f64().unwrap() - 25.0).abs() <= radius_tolerance);
    }
}

#[test]
fn annular_rapid_diagnostic_has_exact_origin_and_preserves_every_trusted_prefix() {
    let catalogue: Vec<Value> = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/annular-diagnostics.json"
    ))
    .unwrap();
    assert_eq!(catalogue.len(), 1);
    let item = &catalogue[0];
    assert_eq!(item["id"], "diagnose-annular-rapid");
    assert_eq!(item["file"], "rapid-through-wall.nc");
    assert_eq!(item["correctionId"], "rapid-through-bore");
    let (request, inner) = request(
        item,
        include_str!("../../../fixtures/lathe/rapid-through-wall.nc"),
    );
    let program = compile_v2(&request);
    assert!(program.executable);
    assert!(program.diagnostics.is_empty());
    assert_eq!(program.blocks.len(), 6);
    let want = &item["diagnostic"];
    assert_eq!(want["stage"], "annular-profile");
    assert_eq!(want["code"], "RAPID_IN_STOCK");
    assert_eq!(want["severity"], "warning");
    let failed = want["failedAtBlock"].as_u64().unwrap() as usize;
    let evaluated = want["evaluatedBlocks"].as_u64().unwrap() as usize;
    assert_eq!((failed, evaluated), (5, 4));
    for cursor in 0..=program.blocks.len() {
        let profile = profile_at_v3(&program, &request.setup.stock, inner, cursor);
        assert_eq!(profile.profile_version, 3);
        assert_eq!(profile.source_revision, request.source_revision);
        assert_eq!(profile.completed_blocks, cursor);
        assert_eq!(profile.complete, cursor < failed);
        assert_eq!(profile.evaluated_blocks, cursor.min(evaluated));
        assert_untouched(&profile, &want["frozenProfile"]);
        if cursor < failed {
            assert!(profile.diagnostics.is_empty());
        } else {
            assert_eq!(profile.diagnostics.len(), 1);
            let actual = serde_json::to_value(&profile.diagnostics[0]).unwrap();
            for key in ["code", "severity", "span"] {
                assert_eq!(actual[key], want[key]);
            }
            assert_eq!(
                actual["span"],
                serde_json::json!({"line":5,"columnStart":1,"columnEnd":8})
            );
        }
    }
    // After reaching a later interpreter cursor, rewind removes the diagnostic
    // because reconstruction stops before the offending whole block.
    let rewind = profile_at_v3(&program, &request.setup.stock, inner, 4);
    assert!(rewind.complete);
    assert!(rewind.diagnostics.is_empty());
    assert_untouched(&rewind, &want["frozenProfile"]);
}

#[test]
fn withdrawing_along_the_bore_completes_without_warnings_or_material_change() {
    let catalogue: Vec<Value> = serde_json::from_str(include_str!(
        "../../../fixtures/lathe/annular-corrections.json"
    ))
    .unwrap();
    assert_eq!(catalogue.len(), 1);
    let item = &catalogue[0];
    assert_eq!(item["id"], "rapid-through-bore");
    assert_eq!(item["file"], "rapid-through-bore.nc");
    let (request, inner) = request(
        item,
        include_str!("../../../fixtures/lathe/rapid-through-bore.nc"),
    );
    let program = compile_v2(&request);
    assert!(program.executable);
    assert!(program.diagnostics.is_empty());
    assert_eq!(
        program.blocks.len(),
        item["blockCount"].as_u64().unwrap() as usize
    );
    assert_eq!(program.blocks.len(), 7);
    let mut prefixes = Vec::new();
    for cursor in 0..=program.blocks.len() {
        let profile = profile_at_v3(&program, &request.setup.stock, inner, cursor);
        assert!(profile.complete);
        assert!(profile.diagnostics.is_empty());
        assert_eq!(profile.completed_blocks, cursor);
        assert_eq!(profile.evaluated_blocks, cursor);
        assert_eq!(profile.source_revision, request.source_revision);
        assert_untouched(&profile, &item["expectedAnnularProfile"]);
        prefixes.push(serde_json::to_value(profile).unwrap());
    }
    let final_state = program.final_state.as_ref().unwrap();
    assert!(final_state.ended);
    assert!(!final_state.spindle_on);
    assert_eq!(
        final_state.tool_id.as_deref(),
        item["expectedFinalToolId"].as_str()
    );
    let expected_position: Position =
        serde_json::from_value(item["expectedFinalPosition"].clone()).unwrap();
    let tolerance = item["toleranceMm"].as_f64().unwrap();
    assert!((final_state.position.r_mm - expected_position.r_mm).abs() <= tolerance);
    assert!((final_state.position.z_mm - expected_position.z_mm).abs() <= tolerance);
    assert_eq!(
        final_state.position,
        Position {
            r_mm: 30.0,
            z_mm: 5.0
        }
    );
    for cursor in (0..=program.blocks.len()).rev() {
        assert_eq!(
            serde_json::to_value(profile_at_v3(&program, &request.setup.stock, inner, cursor))
                .unwrap(),
            prefixes[cursor]
        );
    }
}
