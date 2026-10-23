use cnc_core::{CompileRequest, Setup, compile};

fn main() {
    let request = CompileRequest {
        api_version: 1,
        dialect: "edu-lathe-v1".into(),
        source_revision: 1,
        source: include_str!("../../../fixtures/lathe/first-program.nc").into(),
        setup: serde_json::from_str::<Setup>(include_str!("../../../fixtures/lathe/setup.json"))
            .expect("valid fixture"),
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&compile(&request)).expect("serializable result")
    );
}
