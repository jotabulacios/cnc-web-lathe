use cnc_core::{CompileRequest, Setup, compile, profile_at};

fn main() {
    let request = CompileRequest {
        api_version: 1,
        dialect: "edu-lathe-v1".into(),
        source_revision: 1,
        source: include_str!("../../../fixtures/lathe/two-step-turning.nc").into(),
        setup: serde_json::from_str::<Setup>(include_str!("../../../fixtures/lathe/setup.json"))
            .expect("valid setup fixture"),
    };
    let program = compile(&request);
    let profile = profile_at(&program, &request.setup.stock, program.blocks.len());
    println!(
        "{}",
        serde_json::to_string_pretty(&profile).expect("serializable profile")
    );
}
