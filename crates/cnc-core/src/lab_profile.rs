//! Single laboratory entry point for material reconstruction. The choice between
//! the exterior (v2) and annular (v3) models is CNC semantics, so it lives here,
//! not in the TypeScript adapter. Existing versioned functions are unchanged.
use serde::Serialize;

use crate::{
    CompileRequest, CompileResult, DIALECT, StockProfileV2, StockProfileV3, compile_v2,
    profile_at_v2, profile_at_v3,
};

pub const BORING_TOOL_ID: &str = "boring-id";

/// Serialized untagged: each variant already carries its own `profileVersion`.
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum LabProfile {
    Exterior(StockProfileV2),
    Annular(StockProfileV3),
}

impl LabProfile {
    pub fn profile_version(&self) -> u32 {
        match self {
            Self::Exterior(profile) => profile.profile_version,
            Self::Annular(profile) => profile.profile_version,
        }
    }
}

/// A bore, or the interior tool active at setup or after any block, selects the
/// annular model for the WHOLE program: the representation never changes mid-prefix.
pub fn needs_annular_model(
    program: &CompileResult,
    setup_tool_id: &str,
    inner_diameter_mm: f64,
) -> bool {
    inner_diameter_mm != 0.0
        || setup_tool_id == BORING_TOOL_ID
        || program
            .blocks
            .iter()
            .any(|block| block.after_state.tool_id.as_deref() == Some(BORING_TOOL_ID))
}

/// `request` is an edu-lathe-v2 compile request. Without the interior tool, a v2
/// result has the v1 shape, so the exterior reconstruction consumes it relabeled
/// as v1. That keeps v2-only expansions (cycles, offsets) that v1 would reject.
pub fn lab_profile_at(
    request: &CompileRequest,
    inner_diameter_mm: f64,
    completed_blocks: usize,
) -> LabProfile {
    let mut program = compile_v2(request);
    if needs_annular_model(&program, &request.setup.tool_id, inner_diameter_mm) {
        return LabProfile::Annular(profile_at_v3(
            &program,
            &request.setup.stock,
            inner_diameter_mm,
            completed_blocks,
        ));
    }
    program.api_version = 1;
    program.dialect = DIALECT.into();
    LabProfile::Exterior(profile_at_v2(
        &program,
        &request.setup.stock,
        completed_blocks,
    ))
}
