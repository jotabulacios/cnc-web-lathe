//! Thin JS boundary. All CNC semantics live in cnc-core.
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn compile(request: JsValue) -> Result<JsValue, JsValue> {
    compile_request(request, false)
}

#[wasm_bindgen]
pub fn compile_v2(request: JsValue) -> Result<JsValue, JsValue> {
    compile_request(request, true)
}

fn compile_request(request: JsValue, extended: bool) -> Result<JsValue, JsValue> {
    // Deserialize through Value so JS object keys are enumerated. Direct typed
    // serde-wasm-bindgen deserialization does not enforce deny_unknown_fields.
    let value: serde_json::Value = serde_wasm_bindgen::from_value(request)
        .map_err(|error| JsValue::from_str(&format!("INVALID_REQUEST: {error}")))?;
    let request: cnc_core::CompileRequest = serde_json::from_value(value)
        .map_err(|error| JsValue::from_str(&format!("INVALID_REQUEST: {error}")))?;
    (if extended {
        cnc_core::compile_v2(&request)
    } else {
        cnc_core::compile(&request)
    })
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .map_err(|error| JsValue::from_str(&format!("SERIALIZATION_ERROR: {error}")))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnnularRequest {
    program: cnc_core::CompileRequest,
    completed_blocks: usize,
    inner_diameter_mm: f64,
}

#[wasm_bindgen]
pub fn stock_profile_v3(request: JsValue) -> Result<JsValue, JsValue> {
    let value: serde_json::Value = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {e}")))?;
    let request: AnnularRequest = serde_json::from_value(value)
        .map_err(|e| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {e}")))?;
    cnc_core::profile_at_v3(
        &cnc_core::compile_v2(&request.program),
        &request.program.setup.stock,
        request.inner_diameter_mm,
        request.completed_blocks,
    )
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .map_err(|e| JsValue::from_str(&format!("SERIALIZATION_ERROR: {e}")))
}

/// Laboratory profile: Rust selects the exterior or annular model.
#[wasm_bindgen]
pub fn lab_profile(request: JsValue) -> Result<JsValue, JsValue> {
    let value: serde_json::Value = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {e}")))?;
    let request: AnnularRequest = serde_json::from_value(value)
        .map_err(|e| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {e}")))?;
    cnc_core::lab_profile_at(
        &request.program,
        request.inner_diameter_mm,
        request.completed_blocks,
    )
    .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
    .map_err(|e| JsValue::from_str(&format!("SERIALIZATION_ERROR: {e}")))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileRequest {
    program: cnc_core::CompileRequest,
    completed_blocks: usize,
}

#[wasm_bindgen]
pub fn stock_profile(request: JsValue) -> Result<JsValue, JsValue> {
    profile_request(request, false)
}

/// Additive geometry contract. The legacy export retains profileVersion 1.
#[wasm_bindgen]
pub fn stock_profile_v2(request: JsValue) -> Result<JsValue, JsValue> {
    profile_request(request, true)
}

fn profile_request(request: JsValue, linear: bool) -> Result<JsValue, JsValue> {
    let value: serde_json::Value = serde_wasm_bindgen::from_value(request)
        .map_err(|error| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {error}")))?;
    let request: ProfileRequest = serde_json::from_value(value)
        .map_err(|error| JsValue::from_str(&format!("INVALID_PROFILE_REQUEST: {error}")))?;
    let program = cnc_core::compile(&request.program);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    let result = if linear {
        cnc_core::profile_at_v2(
            &program,
            &request.program.setup.stock,
            request.completed_blocks,
        )
        .serialize(&serializer)
    } else {
        cnc_core::profile_at(
            &program,
            &request.program.setup.stock,
            request.completed_blocks,
        )
        .serialize(&serializer)
    };
    result.map_err(|error| JsValue::from_str(&format!("SERIALIZATION_ERROR: {error}")))
}
