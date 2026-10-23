use cnc_core::{MAX_PROFILE_SPANS, Position, linear_profile::*};

fn s(a: f64, b: f64, ra: f64, rb: f64) -> LinearProfileSpan {
    LinearProfileSpan {
        z_start_mm: a,
        z_end_mm: b,
        r_start_mm: ra,
        r_end_mm: rb,
    }
}
fn profile(spans: Vec<LinearProfileSpan>) -> LinearProfile {
    LinearProfile::new(spans, &mut GeometryBudget::default()).unwrap()
}
fn cylinder() -> LinearProfile {
    profile(vec![s(-100.0, 0.0, 25.0, 25.0)])
}
fn cut(p: &LinearProfile, cutter: LinearProfileSpan) -> LinearProfile {
    p.cut(&cutter, &mut GeometryBudget::default()).unwrap()
}
fn penetrates(p: &LinearProfile, a: (f64, f64), b: (f64, f64)) -> bool {
    p.penetrates(
        Position {
            z_mm: a.0,
            r_mm: a.1,
        },
        Position {
            z_mm: b.0,
            r_mm: b.1,
        },
        &mut GeometryBudget::default(),
    )
    .unwrap()
}
fn near(a: f64, b: f64) {
    assert!((a - b).abs() <= 1e-9, "{a} != {b}");
}
fn value(p: &LinearProfile, z: f64) -> f64 {
    let span = p
        .spans()
        .iter()
        .find(|s| s.z_start_mm < z && z < s.z_end_mm)
        .unwrap();
    let t = (z - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
    span.r_start_mm * (1.0 - t) + span.r_end_mm * t
}

#[test]
fn cylinder_clipping_and_air_preserve_the_analytic_shape() {
    let original = cylinder();
    for cutter in [
        s(2.0, 8.0, 0.0, 0.0),
        s(-80.0, -20.0, 30.0, 35.0),
        s(-100.0, 0.0, 25.0, 25.0),
    ] {
        assert_eq!(cut(&original, cutter), original);
    }
    assert_eq!(
        cut(&original, s(-120.0, 20.0, 20.0, 20.0)).spans(),
        &[s(-100.0, 0.0, 20.0, 20.0)]
    );
    assert_eq!(original, cylinder());
}

#[test]
fn taper_in_both_radial_directions_is_exact_and_keeps_axial_shoulders() {
    for (ra, rb) in [(10.0, 20.0), (20.0, 10.0)] {
        let p = cut(&cylinder(), s(-60.0, -20.0, ra, rb));
        assert_eq!(
            p.spans(),
            &[
                s(-100.0, -60.0, 25.0, 25.0),
                s(-60.0, -20.0, ra, rb),
                s(-20.0, 0.0, 25.0, 25.0)
            ]
        );
        near(value(&p, -40.0), 15.0);
    }
}

#[test]
fn crossing_a_cylinder_splits_at_the_analytic_intersection_in_both_directions() {
    assert_eq!(
        cut(&cylinder(), s(-100.0, 0.0, 15.0, 35.0)).spans(),
        &[s(-100.0, -50.0, 15.0, 25.0), s(-50.0, 0.0, 25.0, 25.0)]
    );
    assert_eq!(
        cut(&cylinder(), s(-100.0, 0.0, 35.0, 15.0)).spans(),
        &[s(-100.0, -50.0, 25.0, 25.0), s(-50.0, 0.0, 25.0, 15.0)]
    );
}

#[test]
fn crossing_two_cones_keeps_the_lower_envelope_and_is_idempotent() {
    let first = profile(vec![s(-100.0, 0.0, 10.0, 20.0)]);
    let cutter = s(-100.0, 0.0, 20.0, 10.0);
    let result = cut(&first, cutter.clone());
    assert_eq!(
        result.spans(),
        &[s(-100.0, -50.0, 10.0, 15.0), s(-50.0, 0.0, 15.0, 10.0)]
    );
    assert_eq!(cut(&result, cutter), result);
    near(value(&result, -75.0), 12.5);
    near(value(&result, -25.0), 12.5);
}

#[test]
fn outside_endpoints_are_clipped_locally_and_zero_radius_tips_are_preserved() {
    let p = cut(&cylinder(), s(-120.0, 20.0, 0.0, 28.0));
    assert_eq!(p.spans(), &[s(-100.0, 0.0, 4.0, 24.0)]);
    assert_eq!(
        cut(&cylinder(), s(-100.0, 0.0, 20.0, 0.0)).spans(),
        &[s(-100.0, 0.0, 20.0, 0.0)]
    );
    assert_eq!(
        cut(&cylinder(), s(-100.0, 0.0, 0.0, 0.0)).spans(),
        &[s(-100.0, 0.0, 0.0, 0.0)]
    );
}

#[test]
fn strict_contact_on_cones_and_boundary_points_does_not_penetrate() {
    let p = profile(vec![s(-100.0, 0.0, 10.0, 20.0)]);
    assert!(!penetrates(&p, (-100.0, 10.0), (0.0, 20.0)));
    assert!(!penetrates(&p, (-25.0, 17.5), (-75.0, 12.5)));
    assert!(!penetrates(&p, (-100.0, 0.0), (-100.0, 30.0)));
    assert!(!penetrates(&p, (0.0, 0.0), (0.0, 30.0)));
    assert!(!penetrates(&p, (0.0, 20.0), (20.0, 0.0)));
    assert!(penetrates(&p, (-75.0, 12.5), (-75.0, 12.49)));
    assert!(penetrates(&p, (-100.0, 9.0), (0.0, 20.0)));
}

#[test]
fn penetration_checks_interior_spans_even_when_global_endpoints_are_in_air() {
    let p = profile(vec![
        s(-100.0, -60.0, 10.0, 10.0),
        s(-60.0, -40.0, 25.0, 25.0),
        s(-40.0, 0.0, 10.0, 10.0),
    ]);
    assert!(penetrates(&p, (-120.0, 20.0), (20.0, 20.0)));
    assert!(penetrates(&p, (20.0, 20.0), (-120.0, 20.0)));
    assert!(!penetrates(&p, (-100.0, 25.0), (0.0, 25.0)));
    assert!(!penetrates(&p, (-60.0, 10.0), (-60.0, 30.0)));
    assert!(penetrates(&p, (-60.0, 9.0), (-60.0, 30.0)));
}

#[test]
fn invalid_profiles_and_motion_coordinates_are_rejected() {
    for spans in [
        vec![],
        vec![s(0.0, 0.0, 1.0, 1.0)],
        vec![s(2.0, 1.0, 1.0, 1.0)],
        vec![s(-1.0, 0.0, -1.0, 1.0)],
        vec![s(-1.0, 0.0, f64::NAN, 1.0)],
        vec![s(-1.0, 0.0, 1.0, f64::INFINITY)],
        vec![s(-1e10, 0.0, 1.0, 1.0)],
        vec![s(-2.0, -1.0, 1.0, 1.0), s(-0.5, 0.0, 1.0, 1.0)],
        vec![s(-2.0, -0.5, 1.0, 1.0), s(-1.0, 0.0, 1.0, 1.0)],
    ] {
        assert_eq!(
            LinearProfile::new(spans, &mut GeometryBudget::default()).unwrap_err(),
            GeometryError::InvalidGeometry
        );
    }
    let p = cylinder();
    assert_eq!(
        p.cut(&s(-10.0, 0.0, -1.0, 1.0), &mut GeometryBudget::default())
            .unwrap_err(),
        GeometryError::InvalidGeometry
    );
    assert_eq!(
        p.penetrates(
            Position {
                z_mm: 0.0,
                r_mm: f64::NAN
            },
            Position {
                z_mm: 0.0,
                r_mm: 1.0
            },
            &mut GeometryBudget::default()
        )
        .unwrap_err(),
        GeometryError::InvalidGeometry
    );
}

#[test]
fn unrepresentable_crossing_returns_an_error_without_modifying_the_input() {
    let p = profile(vec![s(1e9 - 1.0, 1e9, 1.0, 1.0)]);
    let before = p.clone();
    assert_eq!(
        p.cut(&s(1e9 - 1.0, 1e9, 0.0, 1e9), &mut GeometryBudget::default())
            .unwrap_err(),
        GeometryError::UnrepresentableIntersection
    );
    assert_eq!(p, before);
}

#[test]
fn span_and_operation_limits_leave_the_original_geometry_available() {
    let spans = (0..MAX_PROFILE_SPANS)
        .map(|i| {
            s(
                i as f64,
                i as f64 + 1.0,
                5.0 + (i % 2) as f64,
                5.0 + (i % 2) as f64,
            )
        })
        .collect();
    let p = profile(spans);
    let before = p.clone();
    assert_eq!(
        p.cut(&s(0.25, 0.75, 1.0, 2.0), &mut GeometryBudget::default())
            .unwrap_err(),
        GeometryError::Limit
    );
    assert_eq!(p, before);
    let mut budget = GeometryBudget::default();
    let mut failed = false;
    for _ in 0..600 {
        if p.penetrates(
            Position {
                z_mm: 0.0,
                r_mm: 8.0,
            },
            Position {
                z_mm: MAX_PROFILE_SPANS as f64,
                r_mm: 8.0,
            },
            &mut budget,
        ) == Err(GeometryError::Limit)
        {
            failed = true;
            break;
        }
    }
    assert!(failed);
    assert_eq!(p, before);
}

#[test]
fn deterministic_grid_of_affine_cases_matches_analytic_minimum() {
    for a in 0..8 {
        for b in 0..8 {
            let p = profile(vec![s(-80.0, 0.0, 3.0 + a as f64, 11.0 - b as f64)]);
            let cutter = s(-100.0, 20.0, 12.0 - a as f64, 1.0 + b as f64);
            let result = cut(&p, cutter);
            for i in 0..79 {
                let z = -79.75 + i as f64;
                let current = (3.0 + a as f64) * (-z / 80.0) + (11.0 - b as f64) * (1.0 + z / 80.0);
                let t = (z + 100.0) / 120.0;
                let tool = (12.0 - a as f64) * (1.0 - t) + (1.0 + b as f64) * t;
                near(value(&result, z), current.min(tool));
            }
        }
    }
}

#[test]
fn reparameterized_contact_returns_ambiguity_instead_of_false_penetration() {
    let p = profile(vec![s(
        -83.88,
        -30.26,
        21.825314285714285,
        10.156580952380954,
    )]);
    let before = p.clone();
    let from = Position {
        z_mm: -58.369575274480056,
        r_mm: 16.27375995258923,
    };
    let to = Position {
        z_mm: -30.26,
        r_mm: 10.156580952380954,
    };
    assert_eq!(
        p.penetrates(from, to, &mut GeometryBudget::default()),
        Err(GeometryError::AmbiguousComparison)
    );
    assert_eq!(
        p.cut(
            &s(from.z_mm, to.z_mm, from.r_mm, to.r_mm),
            &mut GeometryBudget::default()
        ),
        Err(GeometryError::AmbiguousComparison)
    );
    assert_eq!(p, before);
    // The guard scales with radius, not millimeters. It never grants clearance.
    for scale in [1e-100, 1.0, 1e7] {
        let r = 10.0 * scale;
        let p = profile(vec![s(-10.0, 0.0, r, r)]);
        assert_eq!(
            p.penetrates(
                Position {
                    z_mm: -5.0,
                    r_mm: r.next_down()
                },
                Position {
                    z_mm: -5.0,
                    r_mm: 20.0 * scale
                },
                &mut GeometryBudget::default()
            ),
            Err(GeometryError::AmbiguousComparison)
        );
        assert!(penetrates(&p, (-5.0, 9.0 * scale), (-5.0, 20.0 * scale)));
    }
}

#[test]
fn facing_clips_crossing_spans_sets_zero_radius_and_preserves_earlier_material() {
    let mut b = GeometryBudget::default();
    let p = profile(vec![
        s(-100.0, -40.0, 25.0, 25.0),
        s(-40.0, 0.0, 20.0, 20.0),
    ]);
    let faced = p.face_to(-10.0, &mut b).unwrap();
    let spans = faced.spans();
    assert_eq!(spans.len(), 3);
    assert_eq!(spans[0], s(-100.0, -40.0, 25.0, 25.0));
    assert_eq!(spans[1], s(-40.0, -10.0, 20.0, 20.0));
    assert_eq!(spans[2], s(-10.0, 0.0, 0.0, 0.0));

    // Facing at z=0 leaves the profile completely intact.
    let at_zero = p.face_to(0.0, &mut b).unwrap();
    assert_eq!(at_zero, p);

    // Deep facing behind the step eliminates the step and leaves a single zero span.
    let deep = p.face_to(-50.0, &mut b).unwrap();
    let spans = deep.spans();
    assert_eq!(spans.len(), 2);
    assert_eq!(spans[0], s(-100.0, -50.0, 25.0, 25.0));
    assert_eq!(spans[1], s(-50.0, 0.0, 0.0, 0.0));
}

#[test]
fn facing_multiple_passes_merges_zero_radius_spans() {
    let mut b = GeometryBudget::default();
    let p = profile(vec![s(-100.0, 0.0, 25.0, 25.0)]);
    let pass1 = p.face_to(-2.0, &mut b).unwrap();
    assert_eq!(pass1.spans().len(), 2);
    assert_eq!(pass1.spans()[0], s(-100.0, -2.0, 25.0, 25.0));
    assert_eq!(pass1.spans()[1], s(-2.0, 0.0, 0.0, 0.0));

    let pass2 = pass1.face_to(-5.0, &mut b).unwrap();
    assert_eq!(pass2.spans().len(), 2);
    assert_eq!(pass2.spans()[0], s(-100.0, -5.0, 25.0, 25.0));
    assert_eq!(pass2.spans()[1], s(-5.0, 0.0, 0.0, 0.0));

    // A subsequent pass in the air (z = -3.0 where radius is already 0)
    let max_r = pass2.max_radius_in(-3.0, 0.0, &mut b).unwrap();
    assert_eq!(max_r, 0.0);
    // The retained span only touches the swept interval at its boundary.
    assert_eq!(pass2.max_radius_in(-5.0, 0.0, &mut b).unwrap(), 0.0);
    assert_eq!(pass2.max_radius_in(0.0, 0.0, &mut b).unwrap(), 0.0);
    assert_eq!(pass2.max_radius_in(-6.0, 0.0, &mut b).unwrap(), 25.0);
}
