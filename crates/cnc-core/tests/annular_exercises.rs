use cnc_core::{
    CompileRequest, MotionKind, Position, Setup, Stock, StockProfileV3, compile_v2, profile_at_v3,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Sample {
    z_mm: f64,
    inner_radius_mm: f64,
    outer_radius_mm: f64,
    tolerance_mm: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExpectedProfile {
    samples: Vec<Sample>,
    volume_mm3: f64,
    volume_tolerance_mm3: f64,
}

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Exercise {
    id: String,
    file: String,
    title: String,
    objective: String,
    observations: Vec<String>,
    expected: String,
    expected_annular_profile: ExpectedProfile,
    expected_final_position: Position,
    expected_final_tool_id: String,
    block_count: usize,
    tolerance_mm: f64,
    setup: ExerciseSetup,
}

fn catalogue() -> Vec<Exercise> {
    serde_json::from_str(include_str!(
        "../../../fixtures/lathe/annular-exercises.json"
    ))
    .unwrap()
}

fn assert_volume(profile: &StockProfileV3, expected_pi_factor: f64, tolerance_mm3: f64) {
    let expected = expected_pi_factor * std::f64::consts::PI;
    assert!(
        (profile.volume_mm3 - expected).abs() <= tolerance_mm3,
        "{} != {expected}",
        profile.volume_mm3
    );
}

#[test]
fn guided_annular_catalogue_matches_native_prefixes_and_independent_material_references() {
    let exercises = catalogue();
    assert_eq!(exercises.len(), 2);
    for exercise in exercises
        .into_iter()
        .filter(|e| e.id == "boring-and-turning")
    {
        assert_eq!(exercise.id, "boring-and-turning");
        assert_eq!(exercise.file, "boring.nc");
        assert!(!exercise.title.is_empty());
        assert!(!exercise.objective.is_empty());
        assert!(!exercise.expected.is_empty());
        assert!(exercise.observations.len() >= 3);
        assert!(exercise.observations.iter().all(|item| !item.is_empty()));
        let material = &exercise.setup.stock;
        assert_eq!(material.diameter_mm, 50.0);
        assert_eq!(material.inner_diameter_mm, 20.0);
        assert_eq!(material.length_mm, 100.0);
        assert_eq!(exercise.setup.tool_id, "boring-id");
        assert_eq!(
            exercise.setup.initial_position,
            Position {
                r_mm: 30.0,
                z_mm: 5.0
            }
        );

        // The compiler's historical Stock intentionally has no inner-diameter
        // field. Annular material is passed explicitly to reconstruction below.
        let request = CompileRequest {
            api_version: 2,
            dialect: "edu-lathe-v2".into(),
            source_revision: 31,
            source: include_str!("../../../fixtures/lathe/boring.nc").into(),
            setup: Setup {
                x_convention: exercise.setup.x_convention,
                initial_position: exercise.setup.initial_position,
                stock: Stock {
                    diameter_mm: material.diameter_mm,
                    length_mm: material.length_mm,
                },
                tool_id: exercise.setup.tool_id,
                tool_offsets: None,
                jaws: None,
            },
        };
        let program = compile_v2(&request);
        assert!(program.executable, "{:?}", program.diagnostics);
        assert!(program.diagnostics.is_empty());
        assert_eq!(program.blocks.len(), exercise.block_count);
        assert_eq!(
            program.blocks[1].after_state.tool_id.as_deref(),
            Some("boring-id")
        );
        assert_eq!(
            program.blocks[8].after_state.tool_id.as_deref(),
            Some("roughing-od")
        );
        let cuts: Vec<_> = program
            .motions
            .iter()
            .filter(|m| m.kind == MotionKind::Linear)
            .collect();
        assert_eq!(cuts.len(), 2);
        assert_eq!(
            cuts[0].to,
            Position {
                r_mm: 15.0,
                z_mm: -40.0
            }
        );
        assert_eq!(cuts[0].tool_id, "boring-id");
        assert_eq!(
            cuts[1].to,
            Position {
                r_mm: 20.0,
                z_mm: -20.0
            }
        );
        assert_eq!(cuts[1].tool_id, "roughing-od");

        let mut prefixes = Vec::new();
        for cursor in 0..=program.blocks.len() {
            let profile = profile_at_v3(
                &program,
                &request.setup.stock,
                material.inner_diameter_mm,
                cursor,
            );
            assert!(
                profile.complete,
                "prefix {cursor}: {:?}",
                profile.diagnostics
            );
            assert!(profile.diagnostics.is_empty());
            assert_eq!(profile.source_revision, request.source_revision);
            assert_eq!(profile.completed_blocks, cursor);
            assert_eq!(profile.evaluated_blocks, cursor);
            let factor = if cursor < 5 {
                52500.0
            } else if cursor < 11 {
                47500.0
            } else {
                43000.0
            };
            assert_volume(
                &profile,
                factor,
                exercise.expected_annular_profile.volume_tolerance_mm3,
            );
            prefixes.push(serde_json::to_value(&profile).unwrap());
        }

        let final_state = program.final_state.as_ref().unwrap();
        assert!(final_state.ended);
        assert!(!final_state.spindle_on);
        assert_eq!(
            final_state.tool_id.as_deref(),
            Some(exercise.expected_final_tool_id.as_str())
        );
        let close = |a: f64, b: f64| (a - b).abs() <= exercise.tolerance_mm;
        assert!(close(
            final_state.position.r_mm,
            exercise.expected_final_position.r_mm
        ));
        assert!(close(
            final_state.position.z_mm,
            exercise.expected_final_position.z_mm
        ));

        let final_profile = profile_at_v3(
            &program,
            &request.setup.stock,
            material.inner_diameter_mm,
            program.blocks.len(),
        );
        let references = &exercise.expected_annular_profile;
        assert!(
            (references.volume_mm3 - 43000.0 * std::f64::consts::PI).abs()
                <= references.volume_tolerance_mm3
        );
        assert!(
            (final_profile.volume_mm3 - references.volume_mm3).abs()
                <= references.volume_tolerance_mm3
        );
        assert_eq!(references.samples.len(), 6);
        for (index, sample) in references.samples.iter().enumerate() {
            assert!(index == 0 || references.samples[index - 1].z_mm < sample.z_mm);
            let span = final_profile
                .spans
                .iter()
                .find(|span| span.z_start_mm < sample.z_mm && sample.z_mm < span.z_end_mm)
                .unwrap();
            let t = (sample.z_mm - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
            let inner = span.inner_start_mm * (1.0 - t) + span.inner_end_mm * t;
            let outer = span.outer_start_mm * (1.0 - t) + span.outer_end_mm * t;
            assert!((inner - sample.inner_radius_mm).abs() <= sample.tolerance_mm);
            assert!((outer - sample.outer_radius_mm).abs() <= sample.tolerance_mm);
            let (inner_diameter, outer_diameter) = if sample.z_mm < -40.0 {
                (20.0, 50.0)
            } else if sample.z_mm < -20.0 {
                (30.0, 50.0)
            } else {
                (30.0, 40.0)
            };
            assert_eq!(sample.inner_radius_mm * 2.0, inner_diameter);
            assert_eq!(sample.outer_radius_mm * 2.0, outer_diameter);
        }

        // Computing the final result does not mutate either an earlier stored
        // prefix or the immutable compiled program used to reconstruct it.
        for cursor in (0..=program.blocks.len()).rev() {
            let reconstructed = profile_at_v3(
                &program,
                &request.setup.stock,
                material.inner_diameter_mm,
                cursor,
            );
            assert_eq!(
                serde_json::to_value(reconstructed).unwrap(),
                prefixes[cursor]
            );
        }
    }
}
