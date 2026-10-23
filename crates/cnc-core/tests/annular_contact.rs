use cnc_core::Position;
use cnc_core::annular_profile::{AnnularProfile, AnnularProfileSpan};
use cnc_core::linear_profile::{GeometryBudget, GeometryError, LinearProfile, LinearProfileSpan};

fn tube() -> AnnularProfile {
    AnnularProfile::cylinder(50.0, 20.0, 100.0, &mut GeometryBudget::default()).unwrap()
}
fn p(r: f64, z: f64) -> Position {
    Position { r_mm: r, z_mm: z }
}
fn touches(profile: &AnnularProfile, a: Position, b: Position) -> Result<bool, GeometryError> {
    profile.penetrates(a, b, &mut GeometryBudget::default())
}

#[test]
fn axial_moves_in_the_hole_and_on_either_wall_do_not_enter_material() {
    for r in [0.0, 5.0, 10.0, 25.0, 30.0] {
        assert_eq!(touches(&tube(), p(r, 5.0), p(r, -120.0)), Ok(false));
    }
    assert_eq!(touches(&tube(), p(15.0, 5.0), p(15.0, -120.0)), Ok(true));
}

#[test]
fn paths_with_both_endpoints_in_air_can_cross_both_walls() {
    for (a, b) in [
        (p(5.0, -80.0), p(30.0, -20.0)),
        (p(30.0, -80.0), p(5.0, -20.0)),
    ] {
        assert_eq!(touches(&tube(), a, b), Ok(true));
        assert_eq!(touches(&tube(), b, a), Ok(true));
    }
}

#[test]
fn radial_moves_detect_material_but_face_and_hole_contact_are_allowed() {
    assert_eq!(touches(&tube(), p(5.0, -20.0), p(30.0, -20.0)), Ok(true));
    for (a, b) in [
        (p(0.0, -20.0), p(10.0, -20.0)),
        (p(25.0, -20.0), p(30.0, -20.0)),
        (p(0.0, 0.0), p(30.0, 0.0)),
        (p(0.0, -100.0), p(30.0, -100.0)),
    ] {
        assert_eq!(touches(&tube(), a, b), Ok(false));
    }
    assert_eq!(touches(&tube(), p(15.0, -20.0), p(15.0, -20.0)), Ok(true));
    assert_eq!(touches(&tube(), p(5.0, -20.0), p(5.0, -20.0)), Ok(false));
}

#[test]
fn radial_shoulder_uses_material_common_to_both_neighbors() {
    let bored = tube()
        .bore(
            &LinearProfileSpan {
                z_start_mm: -40.0,
                z_end_mm: 0.0,
                r_start_mm: 15.0,
                r_end_mm: 15.0,
            },
            &mut GeometryBudget::default(),
        )
        .unwrap();
    assert_eq!(touches(&bored, p(5.0, -40.0), p(15.0, -40.0)), Ok(false));
    assert_eq!(touches(&bored, p(15.0, -40.0), p(20.0, -40.0)), Ok(true));
    assert_eq!(touches(&bored, p(12.0, -50.0), p(12.0, -30.0)), Ok(true));
}

#[test]
fn conical_hole_wall_contact_and_real_penetration_are_distinct() {
    let profile = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            inner_start_mm: 5.0,
            inner_end_mm: 15.0,
            outer_start_mm: 25.0,
            outer_end_mm: 20.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    assert_eq!(touches(&profile, p(5.0, -100.0), p(15.0, 0.0)), Ok(false));
    assert_eq!(touches(&profile, p(25.0, -100.0), p(20.0, 0.0)), Ok(false));
    assert_eq!(touches(&profile, p(10.0, -100.0), p(17.0, 0.0)), Ok(true));
    assert_eq!(touches(&profile, p(0.0, -100.0), p(10.0, 0.0)), Ok(false));
}

#[test]
fn empty_sections_never_report_material_even_when_a_line_crosses_the_radius() {
    let empty = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            inner_start_mm: 10.0,
            inner_end_mm: 20.0,
            outer_start_mm: 10.0,
            outer_end_mm: 20.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    assert_eq!(touches(&empty, p(0.0, -100.0), p(30.0, 0.0)), Ok(false));
    assert_eq!(touches(&empty, p(0.0, -50.0), p(30.0, -50.0)), Ok(false));
}

#[test]
fn an_axis_is_material_for_a_solid_and_air_for_a_tube() {
    let solid = AnnularProfile::cylinder(50.0, 0.0, 100.0, &mut GeometryBudget::default()).unwrap();
    for (a, b) in [
        (p(0.0, -50.0), p(0.0, -50.0)),
        (p(0.0, 5.0), p(0.0, -120.0)),
    ] {
        assert_eq!(touches(&solid, a, b), Ok(true));
        assert_eq!(touches(&tube(), a, b), Ok(false));
    }
}

#[test]
fn annular_solid_matches_existing_exterior_classifier_on_a_grid() {
    let solid = AnnularProfile::cylinder(50.0, 0.0, 100.0, &mut GeometryBudget::default()).unwrap();
    let exterior = LinearProfile::new(
        vec![LinearProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            r_start_mm: 25.0,
            r_end_mm: 25.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    for r1 in [0.0, 10.0, 25.0, 30.0] {
        for r2 in [0.0, 10.0, 25.0, 30.0] {
            for z1 in [-120.0, -100.0, -50.0, 0.0, 5.0] {
                for z2 in [-120.0, -100.0, -50.0, 0.0, 5.0] {
                    let a = p(r1, z1);
                    let b = p(r2, z2);
                    assert_eq!(
                        touches(&solid, a, b),
                        exterior.penetrates(a, b, &mut GeometryBudget::default()),
                        "{a:?} -> {b:?}"
                    );
                }
            }
        }
    }
}

#[test]
fn near_roundoff_contact_is_not_reported_as_certain_air() {
    let r = f64::from_bits(10.0_f64.to_bits() + 1);
    assert_eq!(
        touches(&tube(), p(r, -80.0), p(r, -20.0)),
        Err(GeometryError::AmbiguousComparison)
    );
}

#[test]
fn invalid_motion_coordinates_fail_even_when_outside_material() {
    for bad in [p(-1.0, 20.0), p(f64::NAN, 20.0), p(0.0, f64::INFINITY)] {
        assert_eq!(
            touches(&tube(), bad, p(0.0, 20.0)),
            Err(GeometryError::InvalidGeometry)
        );
    }
}

#[test]
fn interpolated_equality_does_not_hide_sub_ulp_penetration() {
    let next = f64::from_bits(10.0_f64.to_bits() + 1);
    for scale in [1e6, 1e9] {
        for (a, b) in [
            (p(10.0, -scale), p(next, scale)),
            (p(next, scale), p(10.0, -scale)),
        ] {
            assert_ne!(touches(&tube(), a, b), Ok(false));
        }
    }
    let thin = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            inner_start_mm: 10.0,
            inner_end_mm: 10.0,
            outer_start_mm: next,
            outer_end_mm: 10.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    assert!(thin.volume_mm3() > 0.0);
    assert_ne!(touches(&thin, p(0.0, -50.0), p(20.0, -50.0)), Ok(false));
}
