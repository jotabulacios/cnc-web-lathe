//! Educational lathe interpreter. Coordinates are physical radii and axial mm.
//! No web, renderer, clock, filesystem, or machine-control dependencies.
pub mod annular_profile;
mod cycles;
mod interpreter;
mod lab_profile;
pub mod linear_profile;
mod nose;
mod profile;
mod profile_v2;
mod profile_v3;
mod syntax;
mod timing;
mod tool_offsets;
pub mod tool_reference;
mod types;

pub use cycles::{CYCLE_PASS_CLEARANCE_MM, MAX_CYCLE_MOTIONS, MIN_CYCLE_DEPTH_MM};
pub use interpreter::{ARC_RADIUS_EPS_MM, compile, compile_v2};
pub use lab_profile::*;
pub use profile::*;
pub use profile_v2::*;
pub use profile_v3::*;
pub use timing::RAPID_MM_MIN;
pub use tool_offsets::{MAX_NOSE_RADIUS_MM, MAX_OFFSET_MM, ToolOffset, physical_tip};
pub use types::*;
