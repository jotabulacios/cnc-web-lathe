use cnc_core::*;
use serde_json::to_value;

fn request(source: &str, tool_id: &str) -> CompileRequest {
    CompileRequest {
        api_version: 2,
        dialect: "edu-lathe-v2".into(),
        source_revision: 3,
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
            tool_id: tool_id.into(),
            tool_offsets: None,
        },
    }
}

fn legacy(req: &CompileRequest) -> CompileRequest {
    let mut legacy = req.clone();
    legacy.api_version = 1;
    legacy.dialect = "edu-lathe-v1".into();
    legacy
}

const TURNING: &str = "S900 M03\nG00 X46 Z2\nG01 Z-30 F100\nG00 X60 Z5\nM30";
const ARC: &str = "S900 M03\nG00 X40 Z2\nG01 Z0 F100\nG03 X50 Z-5 I0 K-5\nG00 X60 Z5\nM30";

#[test]
fn solid_without_interior_tool_keeps_the_historical_exterior_reconstruction() {
    for source in [TURNING, ARC] {
        let req = request(source, "generic-od");
        for cursor in 0..=compile_v2(&req).blocks.len() {
            let profile = lab_profile_at(&req, 0.0, cursor);
            assert_eq!(profile.profile_version(), 2);
            let expected = profile_at_v2(&compile(&legacy(&req)), &req.setup.stock, cursor);
            assert_eq!(to_value(&profile).unwrap(), to_value(&expected).unwrap());
        }
    }
}

#[test]
fn bore_or_interior_tool_selects_the_annular_model_for_the_whole_program() {
    let tubular = request(TURNING, "generic-od");
    let profile = lab_profile_at(&tubular, 20.0, 3);
    assert_eq!(profile.profile_version(), 3);
    let expected = profile_at_v3(&compile_v2(&tubular), &tubular.setup.stock, 20.0, 3);
    assert_eq!(to_value(&profile).unwrap(), to_value(&expected).unwrap());

    // Interior tool from setup, on a solid.
    assert_eq!(
        lab_profile_at(&request(TURNING, "boring-id"), 0.0, 0).profile_version(),
        3
    );
    // T5 activated later still selects v3 at cursor 0: no switch mid-prefix.
    let later = request(&TURNING.replace("M30", "T5\nM30"), "generic-od");
    assert!(compile_v2(&later).executable);
    assert_eq!(lab_profile_at(&later, 0.0, 0).profile_version(), 3);
    // An arc before a T5 therefore stays outside the annular model, explicitly.
    let arc_then_boring = request(&ARC.replace("M30", "T5\nM30"), "generic-od");
    let blocks = compile_v2(&arc_then_boring).blocks.len();
    match lab_profile_at(&arc_then_boring, 0.0, blocks) {
        LabProfile::Annular(profile) => {
            assert!(!profile.complete);
            assert!(!profile.diagnostics.is_empty());
        }
        LabProfile::Exterior(_) => panic!("T5 anywhere must select the annular model"),
    }
}

#[test]
fn selection_rule_reads_only_setup_bore_and_block_states() {
    let program = compile_v2(&request(TURNING, "generic-od"));
    assert!(!needs_annular_model(&program, "generic-od", 0.0));
    assert!(needs_annular_model(&program, "generic-od", 20.0));
    assert!(needs_annular_model(&program, BORING_TOOL_ID, 0.0));
    // A rejected program has no blocks; the bore still decides.
    let invalid = compile_v2(&request("G71 X10", "generic-od"));
    assert!(!invalid.executable);
    assert!(!needs_annular_model(&invalid, "generic-od", 0.0));
}
