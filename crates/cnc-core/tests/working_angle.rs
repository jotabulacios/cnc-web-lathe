use cnc_core::*;
use serde_json::Value;

/// Practices replaced in the shop review (commit 9e299b3): a cone shrinking
/// toward the chuck and a front rounding toward the chuck.
const OLD_TAPER: &str =
    "G21 G18 G98\nS900 M03\nG00 X40 Z0\nG01 X20 Z-60 F120\nG00 X60\nZ5\nM05\nM30\n";
const OLD_ARC: &str =
    "G21 G18 G98\nT0202\nS900 M03\nG00 X40 Z0\nG03 X20 Z-10 I-10 K0 F100\nG00 X60\nZ5\nM05\nM30\n";

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

fn working_angle(result: &CompileResult) -> Vec<&Diagnostic> {
    result
        .diagnostics
        .iter()
        .filter(|d| d.code == "TOOL_WORKING_ANGLE")
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
fn old_taper_shrinking_toward_the_chuck_warns_with_the_80_degree_insert() {
    for version in [1, 2] {
        let result = compile_with(OLD_TAPER, setup("roughing-od"), version);
        assert!(result.executable, "{:?}", result.diagnostics);
        let warnings = working_angle(&result);
        assert_eq!(warnings.len(), 1, "{:?}", result.diagnostics);
        assert_eq!(warnings[0].severity, Severity::Warning);
        assert_eq!(warnings[0].span.line, 4);
        assert!(warnings[0].message.contains("flanco trasero"));
        // atan(10 / 60) = 9.46° below −Z; the 80° insert allows 5°.
        assert!(
            warnings[0].message.contains("9,5°") && warnings[0].message.contains("hasta 5,0°"),
            "{}",
            warnings[0].message
        );
    }
    // The same block with a T0101 call instead of the setup tool.
    let called = OLD_TAPER.replace("S900 M03", "T0101\nS900 M03");
    let result = compile_with(&called, setup("generic-od"), 1);
    assert_eq!(working_angle(&result)[0].span.line, 5);
    // A 55° insert (32° minor-edge clearance) can follow a 9.5° back taper, and
    // T0 is an ideal point without clearance limits: no warning for either.
    for tool in ["finishing-od", "generic-od"] {
        assert!(working_angle(&compile_with(OLD_TAPER, setup(tool), 1)).is_empty());
    }
}

#[test]
fn old_arc_rounding_toward_the_chuck_warns_on_the_arc_block() {
    for version in [1, 2] {
        let result = compile_with(OLD_ARC, setup("generic-od"), version);
        assert!(result.executable, "{:?}", result.diagnostics);
        let warnings = working_angle(&result);
        assert_eq!(warnings.len(), 1, "{:?}", result.diagnostics);
        assert_eq!(warnings[0].span.line, 5);
        assert!(warnings[0].message.contains("arco"));
        assert!(warnings[0].message.contains("T0202"));
    }
}

#[test]
fn current_catalogue_practices_do_not_warn() {
    let mut checked = 0;
    let mut entries: Vec<Value> = Vec::new();
    for catalogue in CATALOGUES {
        let value: Value = serde_json::from_str(catalogue).unwrap();
        entries.extend(value.as_array().unwrap().iter().cloned());
    }
    let corrections: Value = serde_json::from_str(DIAGNOSTIC_CORRECTIONS).unwrap();
    match corrections {
        Value::Array(items) => entries.extend(items),
        object => entries.push(object),
    }
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
                working_angle(&result).is_empty(),
                "{file} v{version}: {:?}",
                result.diagnostics
            );
            checked += usize::from(result.executable);
        }
    }
    assert!(
        checked >= entries.len(),
        "every practice compiled at least once"
    );
}

#[test]
fn every_fixture_is_clean_with_the_default_and_a_real_roughing_setup() {
    for (file, source) in FIXTURES.iter().filter(|(f, _)| f.ends_with(".nc")) {
        for tool in ["generic-od", "roughing-od"] {
            for version in [1, 2] {
                let result = compile_with(source, setup(tool), version);
                let warnings = working_angle(&result);
                if *file == "first-program.nc" && tool == "roughing-od" {
                    // `U-4 W-10` is a chamfer shrinking toward the chuck: with
                    // a real 80° insert it is the same back-flank cut.
                    assert_eq!(warnings.len(), 1, "{:?}", result.diagnostics);
                    assert_eq!(warnings[0].span.line, 6);
                } else {
                    assert!(
                        warnings.is_empty(),
                        "{file} {tool} v{version}: {:?}",
                        result.diagnostics
                    );
                }
            }
        }
    }
}

#[test]
fn warning_never_blocks_execution_or_changes_the_path() {
    let clean = compile_with(OLD_TAPER, setup("generic-od"), 1);
    let warned = compile_with(OLD_TAPER, setup("roughing-od"), 1);
    assert!(warned.executable);
    assert_eq!(clean.motions.len(), warned.motions.len());
    for (a, b) in clean.motions.iter().zip(&warned.motions) {
        assert_eq!((a.from, a.to), (b.from, b.to));
    }
}

#[test]
fn envelopes_cover_each_direction_class() {
    // From X40 Z0 (inside the blank's front corner region after facing).
    // Every case starts at X40 Z-1, inside the Ø50 blank.
    let cases = [
        ("roughing-od", "G01 X38 Z-20 F100", false), // 3.0° below −Z: within 5°
        ("roughing-od", "G01 X36 Z-11 F100", true),  // 11.3°
        ("roughing-od", "G01 X40 Z-20 F100", false), // pure −Z
        ("roughing-od", "G01 X30 F100", false),      // radial plunge
        ("roughing-od", "G01 X44 Z-20 F100", false), // diameter grows toward the chuck
        ("finishing-od", "G01 X30 Z-20 F100", false), // 14.7°: within 32°
        ("finishing-od", "G01 X20 Z-11 F100", true), // 45°
        ("facing-od", "G01 X40 Z-20 F100", false),   // zero-clearance edge
        ("facing-od", "G01 X30 Z-20 F100", true),    // 14.7°
        ("grooving-od", "G01 X30 F100", false),      // plunge
        ("grooving-od", "G01 W-3 F100", false),      // axial move
        ("grooving-od", "G01 X30 Z-6 F100", true),   // 45° toward the chuck
        ("grooving-od", "G01 X30 Z4 F100", true),    // 45° away from the chuck
        ("generic-od", "G01 X20 Z-11 F100", false),  // ideal point
    ];
    for (tool, line, warns) in cases {
        let source = format!("G21 G18 G98\nS900 M03\nG00 X40 Z-1\n{line}\nG00 X60\nM30\n");
        let result = compile_with(&source, setup(tool), 1);
        assert!(result.executable, "{tool} {line}: {:?}", result.diagnostics);
        assert_eq!(
            !working_angle(&result).is_empty(),
            warns,
            "{tool} {line}: {:?}",
            result.diagnostics
        );
    }
}
