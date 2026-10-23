//! Standalone educational calibration math. Not wired into G-code, profiles,
//! WASM or project contracts. All radial quantities are radii, never diameters.
use crate::{MAX_MAGNITUDE, Position};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ToolVector {
    pub r_mm: f64,
    pub z_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ToolCalibration {
    /// Measured displacement from mounting reference to ideal tool corner.
    pub actual_tip_from_mount: ToolVector,
    /// Registered geometry and wear are separate, signed radial/axial mm.
    pub geometry_register: ToolVector,
    pub wear_register: ToolVector,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReferenceState {
    pub programmed_work_point: Position,
    /// Signed mounting reference, not a cutting point or a new CNC motion.
    pub mount_machine: ToolVector,
    pub physical_tip_machine: Position,
    pub physical_tip_work: Position,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReferenceError {
    InvalidInput,
    RangeExceeded,
    NumericalAmbiguity,
    AxisCrossing,
}

fn valid(value: f64) -> bool {
    value.is_finite() && value.abs() <= MAX_MAGNITUDE
}

fn sum(a: f64, b: f64) -> Result<f64, ReferenceError> {
    let result = a + b;
    if !valid(result) {
        return Err(ReferenceError::RangeExceeded);
    }
    if a != 0.0 && b != 0.0 && (result == a || result == b) {
        return Err(ReferenceError::NumericalAmbiguity);
    }
    Ok(result)
}

// This is an arithmetic consistency guard, not a clearance in physical mm.
fn consistent(a: f64, b: f64) -> Result<(), ReferenceError> {
    if (a - b).abs() > 8.0 * f64::EPSILON * a.abs().max(b.abs()).max(1.0) {
        return Err(ReferenceError::NumericalAmbiguity);
    }
    Ok(())
}

/// Educational convention: Q = W + P - L_register, tip = Q + L_actual.
/// Work origin has axial translation only; R0 remains the spindle axis.
/// Reject lost contributions/cancellation rather than silently shifting a tip.
pub fn resolve_reference(
    programmed: Position,
    work_origin_z_mm: f64,
    calibration: ToolCalibration,
) -> Result<ReferenceState, ReferenceError> {
    let actual = calibration.actual_tip_from_mount;
    let geometry = calibration.geometry_register;
    let wear = calibration.wear_register;
    if [
        programmed.r_mm,
        programmed.z_mm,
        work_origin_z_mm,
        actual.r_mm,
        actual.z_mm,
        geometry.r_mm,
        geometry.z_mm,
        wear.r_mm,
        wear.z_mm,
    ]
    .iter()
    .any(|v| !valid(*v))
        || programmed.r_mm < 0.0
    {
        return Err(ReferenceError::InvalidInput);
    }
    let registered = ToolVector {
        r_mm: sum(geometry.r_mm, wear.r_mm)?,
        z_mm: sum(geometry.z_mm, wear.z_mm)?,
    };
    let programmed_machine_z = sum(work_origin_z_mm, programmed.z_mm)?;
    let mount = ToolVector {
        r_mm: sum(programmed.r_mm, -registered.r_mm)?,
        z_mm: sum(programmed_machine_z, -registered.z_mm)?,
    };
    // Verify the registered inverse separately, before a large wear value can
    // mask precision lost while computing the mounting reference.
    consistent(sum(mount.r_mm, registered.r_mm)?, programmed.r_mm)?;
    consistent(
        sum(sum(mount.z_mm, registered.z_mm)?, -work_origin_z_mm)?,
        programmed.z_mm,
    )?;
    let physical_machine = Position {
        r_mm: sum(mount.r_mm, actual.r_mm)?,
        z_mm: sum(mount.z_mm, actual.z_mm)?,
    };
    let physical_work = Position {
        r_mm: physical_machine.r_mm,
        z_mm: sum(physical_machine.z_mm, -work_origin_z_mm)?,
    };
    let expected_work = Position {
        r_mm: sum(programmed.r_mm, sum(actual.r_mm, -registered.r_mm)?)?,
        z_mm: sum(programmed.z_mm, sum(actual.z_mm, -registered.z_mm)?)?,
    };
    consistent(physical_work.r_mm, expected_work.r_mm)?;
    consistent(physical_work.z_mm, expected_work.z_mm)?;
    if physical_work.r_mm < 0.0 || expected_work.r_mm < 0.0 {
        return Err(ReferenceError::AxisCrossing);
    }
    Ok(ReferenceState {
        programmed_work_point: programmed,
        mount_machine: mount,
        physical_tip_machine: physical_machine,
        physical_tip_work: physical_work,
    })
}
