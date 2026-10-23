use cnc_core::collisions::{
    COLLISION_STEP_MM, DEFAULT_JAW_GRIP_MM, DEFAULT_JAW_HEIGHT_MM, collision_model, resolved_jaws,
    tool_silhouettes,
};
use cnc_core::*;
use serde_json::Value;

/// Practices replaced in the shop review (commit 9e299b3), with their setups
/// of then (T0 neutral tool, Ø50 × 100): a cone shrinking toward the chuck and
/// a front rounding toward the chuck called with T0202.
const OLD_TAPER: &str =
    "G21 G18 G98\nS900 M03\nG00 X40 Z0\nG01 X20 Z-60 F120\nG00 X60\nZ5\nM05\nM30\n";
const OLD_ARC: &str =
    "G21 G18 G98\nT0202\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nG00 X60\nZ5\nM05\nM30\n";
/// Near-radial entry (87°, allowed by the working angle) right behind an
/// untouched Ø50 collar: the shank lands on the collar.
const COLLAR: &str =
    "G21 G18 G98\nT0101\nS800 M03\nG00 X52 Z2\nZ-10\nG01 X30 Z-10.5 F100\nG00 X60\nZ5\nM05\nM30\n";
/// Turning Ø44 down to Z−90 runs into the default jaws (Z−100 to Z−85).
const INTO_JAWS: &str =
    "G21 G18 G98\nT0101\nS800 M03\nG00 X44 Z2\nG01 Z-90 F150\nG00 X60\nZ5\nM05\nM30\n";

const CATALOGUES: [&str; 6] = [
    include_str!("../../../fixtures/lathe/exercises.json"),
    include_str!("../../../fixtures/lathe/cycle-exercises.json"),
    include_str!("../../../fixtures/lathe/annular-exercises.json"),
    include_str!("../../../fixtures/lathe/annular-corrections.json"),
    include_str!("../../../fixtures/lathe/annular-diagnostics.json"),
    include_str!("../../../fixtures/lathe/diagnostic-exercises.json"),
];
const DIAGNOSTIC_CORRECTIONS: &str =
    include_str!("../../../fixtures/lathe/diagnostic-corrections.json");

const FIXTURES: [(&str, &str); 15] = [
    (
        "arc-convex.nc",
        include_str!("../../../fixtures/lathe/arc-convex.nc"),
    ),
    (
        "boring.nc",
        include_str!("../../../fixtures/lathe/boring.nc"),
    ),
    (
        "cycle-roughing-finishing.nc",
        include_str!("../../../fixtures/lathe/cycle-roughing-finishing.nc"),
    ),
    (
        "diagnostic-spindle-fixed.nc",
        include_str!("../../../fixtures/lathe/diagnostic-spindle-fixed.nc"),
    ),
    (
        "diagnostic-spindle-off.nc",
        include_str!("../../../fixtures/lathe/diagnostic-spindle-off.nc"),
    ),
    (
        "diagnostic-unsupported.nc",
        include_str!("../../../fixtures/lathe/diagnostic-unsupported.nc"),
    ),
    (
        "facing-turning.nc",
        include_str!("../../../fixtures/lathe/facing-turning.nc"),
    ),
    (
        "first-program.nc",
        include_str!("../../../fixtures/lathe/first-program.nc"),
    ),
    (
        "incremental-turning.nc",
        include_str!("../../../fixtures/lathe/incremental-turning.nc"),
    ),
    (
        "rapid-through-bore.nc",
        include_str!("../../../fixtures/lathe/rapid-through-bore.nc"),
    ),
    (
        "rapid-through-wall.nc",
        include_str!("../../../fixtures/lathe/rapid-through-wall.nc"),
    ),
    (
        "straight-turning.nc",
        include_str!("../../../fixtures/lathe/straight-turning.nc"),
    ),
    (
        "taper-turning.nc",
        include_str!("../../../fixtures/lathe/taper-turning.nc"),
    ),
    (
        "tubular-facing.nc",
        include_str!("../../../fixtures/lathe/tubular-facing.nc"),
    ),
    (
        "two-step-turning.nc",
        include_str!("../../../fixtures/lathe/two-step-turning.nc"),
    ),
];

fn setup(tool_id: &str) -> Setup {
    let mut setup: Setup =
        serde_json::from_str(include_str!("../../../fixtures/lathe/setup.json")).unwrap();
    setup.tool_id = tool_id.into();
    setup
}

fn compile_with(source: &str, setup: Setup, version: u32) -> CompileResult {
    let request = CompileRequest {
        api_version: version,
        dialect: if version == 1 {
            DIALECT
        } else {
            "edu-lathe-v2"
        }
        .into(),
        source_revision: 1,
        source: source.into(),
        setup,
    };
    if version == 1 {
        compile(&request)
    } else {
        compile_v2(&request)
    }
}

fn with_code<'a>(result: &'a CompileResult, code: &str) -> Vec<&'a Diagnostic> {
    result
        .diagnostics
        .iter()
        .filter(|d| d.code == code)
        .collect()
}

fn collisions(result: &CompileResult) -> Vec<&Diagnostic> {
    result
        .diagnostics
        .iter()
        .filter(|d| d.code.contains("COLLISION"))
        .collect()
}

fn fixture(name: &str) -> &'static str {
    FIXTURES
        .iter()
        .find(|(file, _)| *file == name)
        .unwrap_or_else(|| panic!("fixture {name} not embedded"))
        .1
}

#[test]
fn old_arc_drives_the_finishing_shank_into_the_rounding() {
    for version in [1, 2] {
        let result = compile_with(OLD_ARC, setup("generic-od"), version);
        assert!(result.executable, "{:?}", result.diagnostics);
        let hits = with_code(&result, "TOOL_HOLDER_COLLISION");
        assert_eq!(hits.len(), 1, "{:?}", result.diagnostics);
        let hit = hits[0];
        assert_eq!(hit.severity, Severity::Warning);
        assert_eq!(hit.span.line, 5);
        assert!(hit.message.contains("T0202"), "{}", hit.message);
        assert!(
            hit.message.contains("el mango y el inserto tocan"),
            "{}",
            hit.message
        );
        assert!(hit.message.contains("punta en Z−10 X20"), "{}", hit.message);
        assert!(hit.message.contains("no garantiza"), "{}", hit.message);
        let point = hit.point.expect("collision point");
        assert!(point.z_mm <= 0.0 && point.z_mm > -10.0 && point.r_mm > 10.0);
        // The retract starts inside the material: not reported again.
        assert!(with_code(&result, "JAW_COLLISION").is_empty());
        // The working-angle warning stays on the same block.
        assert_eq!(with_code(&result, "TOOL_WORKING_ANGLE")[0].span.line, 5);
    }
}

#[test]
fn old_taper_does_not_collide_with_its_setup_or_a_real_insert() {
    for tool in ["generic-od", "roughing-od", "finishing-od"] {
        for version in [1, 2] {
            let result = compile_with(OLD_TAPER, setup(tool), version);
            assert!(
                collisions(&result).is_empty(),
                "{tool}: {:?}",
                result.diagnostics
            );
        }
    }
    // Only the back-flank (working angle) warning remains with T0101.
    let roughing = compile_with(OLD_TAPER, setup("roughing-od"), 1);
    assert_eq!(with_code(&roughing, "TOOL_WORKING_ANGLE").len(), 1);
}

#[test]
fn shank_on_a_collar_is_reported_without_a_working_angle_warning() {
    for version in [1, 2] {
        let result = compile_with(COLLAR, setup("generic-od"), version);
        assert!(result.executable, "{:?}", result.diagnostics);
        let hits = with_code(&result, "TOOL_HOLDER_COLLISION");
        assert_eq!(hits.len(), 1, "{:?}", result.diagnostics);
        assert_eq!(hits[0].span.line, 6);
        assert!(
            hits[0].message.contains("el mango y el inserto"),
            "{}",
            hits[0].message
        );
        assert!(with_code(&result, "TOOL_WORKING_ANGLE").is_empty());
    }
}

#[test]
fn rapid_sweeping_the_clamp_through_the_part_is_a_collision_not_a_rapid_in_stock() {
    let mut big = setup("grooving-od");
    big.stock = Stock {
        diameter_mm: 80.0,
        length_mm: 100.0,
    };
    big.initial_position = Position {
        r_mm: 45.0,
        z_mm: 5.0,
    };
    // The tip stays 1 mm in front of the face; the clamp reaches 3.5 mm behind it.
    let source = "G21 G18 G98\nS600 M03\nG00 X90 Z1\nG00 X10\nG00 X90\nM05\nM30\n";
    let result = compile_with(source, big.clone(), 2);
    let hits = with_code(&result, "TOOL_HOLDER_COLLISION");
    assert_eq!(hits.len(), 1, "{:?}", result.diagnostics);
    assert_eq!(hits[0].span.line, 4);
    assert!(
        hits[0].message.contains("la abrazadera"),
        "{}",
        hits[0].message
    );
    assert!(hits[0].message.contains("En rápido"), "{}", hits[0].message);
    let profile = profile_at_v2(
        &{
            let mut v1 = compile_with(source, big.clone(), 1);
            v1.diagnostics.clear();
            v1
        },
        &big.stock,
        5,
    );
    assert!(profile.complete, "{:?}", profile.diagnostics);
    // 2 mm in front of the face the clamp clears the part.
    let clear = source.replace("Z1", "Z4");
    assert!(collisions(&compile_with(&clear, big, 2)).is_empty());
}

#[test]
fn turning_into_the_jaws_is_reported_once_where_it_enters() {
    for version in [1, 2] {
        let result = compile_with(INTO_JAWS, setup("generic-od"), version);
        assert!(result.executable, "{:?}", result.diagnostics);
        let hits = with_code(&result, "JAW_COLLISION");
        assert_eq!(hits.len(), 1, "{:?}", result.diagnostics);
        assert_eq!(hits[0].span.line, 5);
        assert_eq!(hits[0].severity, Severity::Warning);
        assert!(
            hits[0].message.contains("Z−100 hasta Z−85"),
            "{}",
            hits[0].message
        );
        assert!(hits[0].message.contains("X74"), "{}", hits[0].message);
        assert!(hits[0].point.is_some());
    }
    // A rapid behind the jaws, and the neutral tool's tip alone.
    let rapid = "G21 G18 G98\nT0101\nS800 M03\nG00 X60 Z2\nG00 Z-95\nG00 Z5\nM30\n";
    let result = compile_with(rapid, setup("generic-od"), 2);
    assert_eq!(with_code(&result, "JAW_COLLISION")[0].span.line, 5);
    let neutral = INTO_JAWS.replace("T0101\n", "");
    let result = compile_with(&neutral, setup("generic-od"), 2);
    let hits = with_code(&result, "JAW_COLLISION");
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].span.line, 4);
    assert!(
        hits[0].message.contains("la punta de T0"),
        "{}",
        hits[0].message
    );
}

#[test]
fn jaws_follow_the_setup_and_stay_backward_compatible() {
    let base = setup("generic-od");
    assert!(base.jaws.is_none());
    let defaults = resolved_jaws(&base);
    assert_eq!(defaults.grip_length_mm, DEFAULT_JAW_GRIP_MM);
    assert_eq!(defaults.jaw_height_mm, DEFAULT_JAW_HEIGHT_MM);
    let mut short = base.clone();
    short.stock.length_mm = 20.0;
    assert_eq!(resolved_jaws(&short).grip_length_mm, 10.0);

    let mut shallow = base.clone();
    shallow.jaws = Some(ChuckJaws {
        grip_length_mm: 5.0,
        jaw_height_mm: 10.0,
    });
    assert!(collisions(&compile_with(INTO_JAWS, shallow.clone(), 2)).is_empty());
    let json = serde_json::to_value(&shallow).unwrap();
    assert_eq!(json["jaws"]["gripLengthMm"], 5.0);
    assert!(serde_json::to_value(&base).unwrap().get("jaws").is_none());
    let unknown = serde_json::json!({ "gripLengthMm": 5, "jawHeightMm": 10, "x": 1 });
    assert!(serde_json::from_value::<ChuckJaws>(unknown).is_err());

    for (grip, height) in [(-1.0, 10.0), (100.0, 10.0), (5.0, 0.0), (f64::NAN, 10.0)] {
        let mut bad = base.clone();
        bad.jaws = Some(ChuckJaws {
            grip_length_mm: grip,
            jaw_height_mm: height,
        });
        let result = compile_with(INTO_JAWS, bad, 2);
        assert!(!result.executable, "{grip} {height}");
        assert_eq!(result.diagnostics[0].code, "INVALID_REQUEST");
    }
    // Grip 0 keeps the chuck face: running past Z−100 still warns.
    let mut face_only = base;
    face_only.jaws = Some(ChuckJaws {
        grip_length_mm: 0.0,
        jaw_height_mm: 10.0,
    });
    let past = INTO_JAWS.replace("Z-90", "Z-101");
    assert_eq!(
        with_code(&compile_with(&past, face_only, 2), "JAW_COLLISION").len(),
        1
    );
}

#[test]
fn current_catalogue_practices_stay_clean() {
    let mut entries: Vec<Value> = Vec::new();
    for catalogue in CATALOGUES {
        let value: Value = serde_json::from_str(catalogue).unwrap();
        entries.extend(value.as_array().unwrap().iter().cloned());
    }
    match serde_json::from_str::<Value>(DIAGNOSTIC_CORRECTIONS).unwrap() {
        Value::Array(items) => entries.extend(items),
        object => entries.push(object),
    }
    let mut compiled = 0;
    for entry in &entries {
        let file = entry["file"].as_str().unwrap();
        // The annular bore lives in the profile request, not in the compile setup.
        let mut raw = entry["setup"].clone();
        raw["stock"]
            .as_object_mut()
            .unwrap()
            .remove("innerDiameterMm");
        let setup: Setup = serde_json::from_value(raw).unwrap();
        for version in [1, 2] {
            let result = compile_with(fixture(file), setup.clone(), version);
            assert!(
                collisions(&result).is_empty(),
                "{file} v{version}: {:?}",
                result.diagnostics
            );
            compiled += usize::from(result.executable);
        }
    }
    assert!(compiled >= entries.len());
}

#[test]
fn every_fixture_is_clean_with_the_default_setup() {
    for (file, source) in FIXTURES {
        for version in [1, 2] {
            let result = compile_with(source, setup("generic-od"), version);
            assert!(
                collisions(&result).is_empty(),
                "{file} v{version}: {:?}",
                result.diagnostics
            );
        }
    }
    // With a real 80° insert as setup tool, only the first program's chamfer
    // (11.3° below −Z, steeper than the drawn 10° minor edge) touches the
    // back of the insert, on the same block as its working-angle warning.
    for (file, source) in FIXTURES {
        let result = compile_with(source, setup("roughing-od"), 2);
        let hits = collisions(&result);
        if file == "first-program.nc" {
            assert_eq!(hits.len(), 1, "{:?}", result.diagnostics);
            assert_eq!(hits[0].code, "TOOL_HOLDER_COLLISION");
            assert_eq!(hits[0].span.line, 6);
            assert!(hits[0].message.contains("el inserto"));
        } else {
            assert!(hits.is_empty(), "{file}: {:?}", result.diagnostics);
        }
    }
}

#[test]
fn warnings_never_block_execution_or_change_the_path() {
    let clean = compile_with(INTO_JAWS, setup("generic-od"), 2);
    let mut shallow = setup("generic-od");
    shallow.jaws = Some(ChuckJaws {
        grip_length_mm: 1.0,
        jaw_height_mm: 10.0,
    });
    let quiet = compile_with(INTO_JAWS, shallow, 2);
    assert!(clean.executable && quiet.executable);
    assert_eq!(clean.motions.len(), quiet.motions.len());
    for (a, b) in clean.motions.iter().zip(&quiet.motions) {
        assert_eq!((a.from, a.to), (b.from, b.to));
    }
}

#[test]
fn working_angle_uses_the_remaining_material() {
    // Rough Ø30 to Z−40 first, then a back taper that runs entirely in the air
    // above the roughed zone: no contact, no warning. On the blank it warned.
    let source = "G21 G18 G98\nT0101\nS800 M03\nG00 X52 Z2\nX30\nG01 Z-40 F150\nG00 X52\nZ2\nX44\nG01 X36 Z-20 F150\nG00 X60\nM30\n";
    let result = compile_with(source, setup("generic-od"), 2);
    assert!(result.executable, "{:?}", result.diagnostics);
    assert!(
        with_code(&result, "TOOL_WORKING_ANGLE").is_empty(),
        "{:?}",
        result.diagnostics
    );
    let blank = source.replace("X30\nG01 Z-40 F150\nG00 X52\nZ2\n", "");
    let result = compile_with(&blank, setup("generic-od"), 2);
    assert_eq!(with_code(&result, "TOOL_WORKING_ANGLE").len(), 1);
}

#[test]
fn model_exposes_silhouettes_for_the_ts_parity_test() {
    let model = collision_model();
    assert_eq!(model.step_mm, COLLISION_STEP_MM);
    let ids: Vec<_> = tool_silhouettes().iter().map(|t| t.tool_id).collect();
    assert_eq!(
        ids,
        [
            "generic-od",
            "roughing-od",
            "finishing-od",
            "grooving-od",
            "facing-od",
            "boring-id"
        ]
    );
    for tool in &model.tools {
        // The cutting zone starts at the tip.
        assert_eq!(tool.cutting_zone[0], [0.0, 0.0], "{}", tool.tool_id);
        assert_eq!(
            tool.holder_check,
            !tool.checked.is_empty(),
            "{}",
            tool.tool_id
        );
    }
}
