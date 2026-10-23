use cnc_core::tool_reference::{ReferenceError, ToolCalibration, ToolVector, resolve_reference};
use cnc_core::{MAX_MAGNITUDE, Position};

fn vector(r: f64, z: f64) -> ToolVector {
    ToolVector { r_mm: r, z_mm: z }
}
fn calibration() -> ToolCalibration {
    ToolCalibration {
        actual_tip_from_mount: vector(-60.0, -8.0),
        geometry_register: vector(-60.0, -8.0),
        wear_register: vector(0.0, 0.0),
    }
}
fn close(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-11, "{a} != {b}");
}

#[test]
fn perfect_calibration_preserves_tip_for_different_lengths_and_origins() {
    for r in [0.0, 10.0, 20.0, 25.0] {
        for z in [-100.0, -40.0, 0.0, 5.0] {
            for origin in [-1000.0, 0.0, 1000.0] {
                for actual in [vector(-60.0, -8.0), vector(6.0, -64.0), vector(0.0, 0.0)] {
                    let programmed = Position { r_mm: r, z_mm: z };
                    let state = resolve_reference(
                        programmed,
                        origin,
                        ToolCalibration {
                            actual_tip_from_mount: actual,
                            geometry_register: actual,
                            wear_register: vector(0.0, 0.0),
                        },
                    )
                    .unwrap();
                    assert_eq!(state.physical_tip_work, programmed);
                    assert_eq!(state.programmed_work_point, programmed);
                    close(state.mount_machine.r_mm + actual.r_mm, r);
                    close(state.mount_machine.z_mm + actual.z_mm, origin + z);
                }
            }
        }
    }
}

#[test]
fn radial_error_has_twice_the_effect_in_diameter_and_axial_error_is_independent() {
    let mut c = calibration();
    c.geometry_register = vector(-59.9, -7.75);
    let state = resolve_reference(
        Position {
            r_mm: 20.0,
            z_mm: -40.0,
        },
        100.0,
        c,
    )
    .unwrap();
    close(state.mount_machine.r_mm, 79.9);
    close(state.physical_tip_work.r_mm, 19.9);
    close(state.physical_tip_work.r_mm * 2.0, 39.8);
    close(state.physical_tip_work.z_mm, -40.25);
    close(state.physical_tip_machine.z_mm, 59.75);
}

#[test]
fn wear_is_separate_and_uses_the_declared_educational_sign() {
    for sign in [-1.0, 1.0] {
        let mut c = calibration();
        c.wear_register = vector(sign * 0.1, sign * 0.25);
        let state = resolve_reference(
            Position {
                r_mm: 20.0,
                z_mm: -40.0,
            },
            0.0,
            c,
        )
        .unwrap();
        close(state.physical_tip_work.r_mm, 20.0 - sign * 0.1);
        close(state.physical_tip_work.z_mm, -40.0 - sign * 0.25);
        assert_eq!(c.geometry_register, vector(-60.0, -8.0));
    }
}

#[test]
fn invalid_values_range_and_axis_crossing_return_errors() {
    let p = Position {
        r_mm: 20.0,
        z_mm: -40.0,
    };
    for bad in [f64::NAN, f64::INFINITY, MAX_MAGNITUDE * 2.0] {
        let mut c = calibration();
        c.actual_tip_from_mount.r_mm = bad;
        assert_eq!(
            resolve_reference(p, 0.0, c),
            Err(ReferenceError::InvalidInput)
        );
        assert_eq!(
            resolve_reference(p, bad, calibration()),
            Err(ReferenceError::InvalidInput)
        );
    }
    assert_eq!(
        resolve_reference(
            Position {
                r_mm: -1.0,
                z_mm: 0.0
            },
            0.0,
            calibration()
        ),
        Err(ReferenceError::InvalidInput)
    );
    let mut c = calibration();
    c.wear_register.r_mm = 21.0;
    assert_eq!(
        resolve_reference(p, 0.0, c),
        Err(ReferenceError::AxisCrossing)
    );
    assert_eq!(
        resolve_reference(
            Position {
                r_mm: 0.0,
                z_mm: MAX_MAGNITUDE
            },
            MAX_MAGNITUDE,
            calibration()
        ),
        Err(ReferenceError::RangeExceeded)
    );
}

#[test]
fn absorbed_corrections_and_large_origin_cancellation_are_explicit_uncertainties() {
    let mut c = calibration();
    c.wear_register.r_mm = 1e-30;
    assert_eq!(
        resolve_reference(
            Position {
                r_mm: 20.0,
                z_mm: 0.0
            },
            0.0,
            c
        ),
        Err(ReferenceError::NumericalAmbiguity)
    );
    assert_eq!(
        resolve_reference(
            Position {
                r_mm: 20.0,
                z_mm: 1e-6
            },
            1e8,
            calibration()
        ),
        Err(ReferenceError::NumericalAmbiguity)
    );
}
