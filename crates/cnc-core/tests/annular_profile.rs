use cnc_core::annular_profile::{AnnularError, AnnularProfile, AnnularProfileSpan};
use cnc_core::linear_profile::{GeometryBudget, GeometryError, LinearProfile, LinearProfileSpan};
use cnc_core::{MAX_MAGNITUDE, MAX_PROFILE_SPANS};

fn line(z_start: f64, z_end: f64, r_start: f64, r_end: f64) -> LinearProfileSpan {
    LinearProfileSpan {
        z_start_mm: z_start,
        z_end_mm: z_end,
        r_start_mm: r_start,
        r_end_mm: r_end,
    }
}

fn tube() -> AnnularProfile {
    AnnularProfile::cylinder(50.0, 20.0, 100.0, &mut GeometryBudget::default()).unwrap()
}

fn volume(profile: &AnnularProfile, expected_pi_factor: f64) {
    let expected = expected_pi_factor * std::f64::consts::PI;
    assert!(
        (profile.volume_mm3() - expected).abs() <= expected.abs().max(1.0) * 1e-13,
        "{} != {expected}",
        profile.volume_mm3()
    );
}

#[test]
fn tube_has_physical_radii_domain_and_analytic_volume() {
    let profile = tube();
    assert_eq!(profile.spans().len(), 1);
    let span = &profile.spans()[0];
    assert_eq!((span.z_start_mm, span.z_end_mm), (-100.0, 0.0));
    assert_eq!((span.inner_start_mm, span.outer_end_mm), (10.0, 25.0));
    volume(&profile, 52500.0);
}

#[test]
fn zero_inner_radius_is_a_solid() {
    let solid = AnnularProfile::cylinder(50.0, 0.0, 100.0, &mut GeometryBudget::default()).unwrap();
    volume(&solid, 62500.0);
}

#[test]
fn bore_enlarges_only_the_requested_interval_and_is_idempotent() {
    let initial = tube();
    let cutter = line(-40.0, 0.0, 15.0, 15.0);
    let cut = initial
        .bore(&cutter, &mut GeometryBudget::default())
        .unwrap();
    volume(&cut, 47500.0);
    assert_eq!(cut.spans().len(), 2);
    assert_eq!(cut.spans()[0].inner_end_mm, 10.0);
    assert_eq!(cut.spans()[1].inner_start_mm, 15.0);
    assert!(
        cut.spans()
            .iter()
            .all(|s| s.outer_start_mm == 25.0 && s.outer_end_mm == 25.0)
    );
    assert_eq!(
        cut.bore(&cutter, &mut GeometryBudget::default()).unwrap(),
        cut
    );
    volume(&initial, 52500.0);
}

#[test]
fn tapered_bore_matches_frustum_oracle() {
    let cut = tube()
        .bore(
            &line(-40.0, 0.0, 10.0, 15.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    volume(
        &cut,
        52500.0 - (40.0 / 3.0 * (100.0 + 150.0 + 225.0) - 4000.0),
    );
}

#[test]
fn upper_envelope_splits_at_an_interior_intersection() {
    let cut = tube()
        .bore(
            &line(-100.0, 0.0, 5.0, 15.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    assert_eq!(cut.spans().len(), 2);
    assert_eq!(cut.spans()[0].z_end_mm, -50.0);
    assert_eq!(cut.spans()[1].inner_start_mm, 10.0);
    assert_eq!(cut.spans()[1].inner_end_mm, 15.0);
    volume(&cut, 62500.0 - 5000.0 - 50.0 / 3.0 * 475.0);
}

#[test]
fn lower_envelope_retains_the_hole_at_an_intersection() {
    let cut = tube()
        .cut_outer(
            &line(-100.0, 0.0, 30.0, 20.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    assert_eq!(cut.spans()[0].z_end_mm, -50.0);
    assert_eq!(cut.spans()[1].outer_start_mm, 25.0);
    assert_eq!(cut.spans()[1].outer_end_mm, 20.0);
    assert!(
        cut.spans()
            .iter()
            .all(|s| s.inner_start_mm == 10.0 && s.inner_end_mm == 10.0)
    );
    volume(&cut, 52500.0 - 50.0 / 3.0 * 350.0);
}

#[test]
fn interior_and_exterior_cuts_merge_different_partitions() {
    let mut budget = GeometryBudget::default();
    let bored = tube()
        .bore(&line(-40.0, 0.0, 15.0, 15.0), &mut budget)
        .unwrap();
    let turned = bored
        .cut_outer(&line(-20.0, 0.0, 20.0, 20.0), &mut budget)
        .unwrap();
    assert_eq!(turned.spans().len(), 3);
    assert_eq!(
        turned
            .spans()
            .iter()
            .map(|s| s.z_start_mm)
            .collect::<Vec<_>>(),
        vec![-100.0, -40.0, -20.0]
    );
    volume(&turned, 43000.0);
    volume(&bored, 47500.0);
    let reverse = tube()
        .cut_outer(&line(-20.0, 0.0, 20.0, 20.0), &mut budget)
        .unwrap()
        .bore(&line(-40.0, 0.0, 15.0, 15.0), &mut budget)
        .unwrap();
    assert_eq!(turned, reverse);
}

#[test]
fn two_conical_boundaries_match_the_analytic_difference() {
    let mut span = tube().spans()[0].clone();
    span.inner_start_mm = 5.0;
    span.outer_end_mm = 20.0;
    let profile = AnnularProfile::new(vec![span], &mut GeometryBudget::default()).unwrap();
    volume(&profile, 45000.0);
}

#[test]
fn a_cut_crossing_either_wall_is_atomic() {
    let initial = tube();
    let saved = initial.clone();
    for (internal, cutter) in [
        (true, line(-40.0, 0.0, 20.0, 30.0)),
        (false, line(-40.0, 0.0, 15.0, 5.0)),
    ] {
        let result = if internal {
            initial.bore(&cutter, &mut GeometryBudget::default())
        } else {
            initial.cut_outer(&cutter, &mut GeometryBudget::default())
        };
        assert_eq!(result, Err(AnnularError::WallCrossing));
        assert_eq!(initial, saved);
    }
}

#[test]
fn wall_crossing_checks_each_shoulder_side() {
    let turned = tube()
        .cut_outer(
            &line(-20.0, 0.0, 12.0, 12.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    let saved = turned.clone();
    assert_eq!(
        turned.bore(
            &line(-40.0, 0.0, 15.0, 15.0),
            &mut GeometryBudget::default()
        ),
        Err(AnnularError::WallCrossing)
    );
    assert_eq!(turned, saved);
}

#[test]
fn equal_boundaries_represent_empty_material_without_invalid_domain() {
    let empty = tube()
        .bore(
            &line(-100.0, 0.0, 25.0, 25.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    volume(&empty, 0.0);
    assert_eq!(
        empty.spans()[0].inner_start_mm,
        empty.spans()[0].outer_start_mm
    );
    assert_eq!(empty.spans()[0].z_start_mm, -100.0);
}

#[test]
fn air_and_nonoverlapping_cuts_leave_material_unchanged() {
    let initial = tube();
    for cutter in [
        line(-50.0, 0.0, 5.0, 5.0),
        line(0.0, 20.0, 30.0, 30.0),
        line(-120.0, -100.0, 30.0, 30.0),
    ] {
        assert_eq!(
            initial
                .bore(&cutter, &mut GeometryBudget::default())
                .unwrap(),
            initial
        );
    }
    assert_eq!(
        initial
            .cut_outer(
                &line(-100.0, 0.0, 30.0, 30.0),
                &mut GeometryBudget::default()
            )
            .unwrap(),
        initial
    );
}

#[test]
fn cuts_are_clipped_to_the_axial_domain() {
    let cut = tube()
        .bore(
            &line(-150.0, 50.0, 15.0, 15.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    volume(&cut, 40000.0);
    assert_eq!(cut.spans().len(), 1);
    assert_eq!(
        (cut.spans()[0].z_start_mm, cut.spans()[0].z_end_mm),
        (-100.0, 0.0)
    );
}

#[test]
fn initial_stock_rejects_invalid_and_nonfinite_dimensions() {
    for (outer, inner, length) in [
        (0.0, 0.0, 100.0),
        (50.0, -1.0, 100.0),
        (50.0, 50.0, 100.0),
        (50.0, 60.0, 100.0),
        (50.0, 20.0, 0.0),
        (f64::NAN, 20.0, 100.0),
        (50.0, f64::INFINITY, 100.0),
        (50.0, 20.0, -100.0),
        (MAX_MAGNITUDE * 2.0, 20.0, 100.0),
        (50.0, 20.0, f64::INFINITY),
        (50.0, f64::from_bits(1), 100.0),
    ] {
        assert_eq!(
            AnnularProfile::cylinder(outer, inner, length, &mut GeometryBudget::default()),
            Err(AnnularError::Geometry(GeometryError::InvalidGeometry))
        );
    }
}

#[test]
fn arbitrary_spans_require_ordered_radii_and_a_contiguous_domain() {
    let valid = tube().spans()[0].clone();
    let mut bad_spans = Vec::new();
    let mut bad = valid.clone();
    bad.inner_start_mm = 26.0;
    bad_spans.push(vec![bad]);
    let mut bad = valid.clone();
    bad.inner_end_mm = -1.0;
    bad_spans.push(vec![bad]);
    let mut bad = valid.clone();
    bad.outer_end_mm = f64::NAN;
    bad_spans.push(vec![bad]);
    let mut bad = valid.clone();
    bad.z_end_mm = bad.z_start_mm;
    bad_spans.push(vec![bad]);
    let mut bad = valid.clone();
    bad.z_start_mm = 1.0;
    bad.z_end_mm = 2.0;
    bad_spans.push(vec![valid.clone(), bad]);
    bad_spans.push(vec![valid.clone(), valid.clone()]);
    bad_spans.push(vec![]);
    bad_spans.push(vec![valid; MAX_PROFILE_SPANS + 1]);
    for spans in bad_spans {
        assert_eq!(
            AnnularProfile::new(spans, &mut GeometryBudget::default()),
            Err(AnnularError::Geometry(GeometryError::InvalidGeometry))
        );
    }
}

#[test]
fn invalid_cutters_fail_without_modifying_the_profile() {
    let profile = tube();
    let saved = profile.clone();
    for cutter in [
        line(0.0, 0.0, 15.0, 15.0),
        line(-40.0, 0.0, -1.0, 15.0),
        line(-40.0, 0.0, 15.0, f64::NAN),
    ] {
        assert_eq!(
            profile.bore(&cutter, &mut GeometryBudget::default()),
            Err(AnnularError::Geometry(GeometryError::InvalidGeometry))
        );
        assert_eq!(profile, saved);
    }
}

#[test]
fn thin_walls_keep_the_small_volume_instead_of_cancelling_frustums() {
    let outer = 1e8;
    let inner = outer - 1e-6;
    let profile = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -100.0,
            z_end_mm: 0.0,
            inner_start_mm: inner,
            inner_end_mm: inner,
            outer_start_mm: outer,
            outer_end_mm: outer,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    volume(&profile, 100.0 * (outer - inner) * (outer + inner));
    assert!(profile.volume_mm3() > 0.0);
}

#[test]
fn upper_envelope_preserves_explicit_numerical_ambiguity() {
    let base = LinearProfile::new(
        vec![line(-100.0, 0.0, 10.0, 10.0)],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    let nearly_equal = f64::from_bits(10.0f64.to_bits() + 1);
    assert_eq!(
        base.raise(
            &line(-100.0, 0.0, nearly_equal, nearly_equal),
            &mut GeometryBudget::default()
        ),
        Err(GeometryError::AmbiguousComparison)
    );
}

#[test]
fn repeated_cuts_share_and_eventually_exhaust_the_operation_budget() {
    let mut budget = GeometryBudget::default();
    let profile = tube();
    let saved = profile.clone();
    let cutter = line(-100.0, 0.0, 5.0, 5.0);
    let mut exhausted = false;
    for _ in 0..300_000 {
        match profile.bore(&cutter, &mut budget) {
            Ok(next) => assert_eq!(next, profile),
            Err(AnnularError::Geometry(GeometryError::Limit)) => {
                exhausted = true;
                break;
            }
            Err(error) => panic!("unexpected error: {error:?}"),
        }
    }
    assert!(exhausted);
    assert_eq!(profile, saved);
}

#[test]
fn reconstruction_respects_the_maximum_number_of_material_spans() {
    let spans = (0..MAX_PROFILE_SPANS)
        .map(|i| AnnularProfileSpan {
            z_start_mm: i as f64,
            z_end_mm: (i + 1) as f64,
            inner_start_mm: if i % 2 == 0 { 10.0 } else { 11.0 },
            inner_end_mm: if i % 2 == 0 { 10.0 } else { 11.0 },
            outer_start_mm: 25.0,
            outer_end_mm: 25.0,
        })
        .collect();
    let profile = AnnularProfile::new(spans, &mut GeometryBudget::default()).unwrap();
    let saved = profile.clone();
    let result = profile.cut_outer(
        &line(0.5, MAX_PROFILE_SPANS as f64, 20.0, 20.0),
        &mut GeometryBudget::default(),
    );
    assert_eq!(result, Err(AnnularError::Geometry(GeometryError::Limit)));
    assert_eq!(profile, saved);
}

#[test]
fn upper_envelope_matches_independent_affine_maximum_on_a_deterministic_grid() {
    for a in [0.0, 5.0, 10.0, 15.0, 20.0] {
        for b in [0.0, 5.0, 10.0, 15.0, 20.0] {
            for c in [0.0, 5.0, 10.0, 15.0, 20.0] {
                for d in [0.0, 5.0, 10.0, 15.0, 20.0] {
                    let initial = LinearProfile::new(
                        vec![line(-100.0, 0.0, a, b)],
                        &mut GeometryBudget::default(),
                    )
                    .unwrap();
                    let raised = initial
                        .raise(&line(-100.0, 0.0, c, d), &mut GeometryBudget::default())
                        .unwrap();
                    for i in 0..=100 {
                        let t = i as f64 / 100.0;
                        let z = -100.0 + 100.0 * t;
                        let expected = (a * (1.0 - t) + b * t).max(c * (1.0 - t) + d * t);
                        let span = raised
                            .spans()
                            .iter()
                            .find(|s| s.z_start_mm <= z && z <= s.z_end_mm)
                            .unwrap();
                        let local = (z - span.z_start_mm) / (span.z_end_mm - span.z_start_mm);
                        let actual = span.r_start_mm * (1.0 - local) + span.r_end_mm * local;
                        assert!(
                            (actual - expected).abs() < 1e-12,
                            "{a}, {b}, {c}, {d} at {z}: {actual} != {expected}"
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn shared_acceptance_fixture_has_independent_volume_and_exact_final_sections() {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Initial {
        outer_diameter_mm: f64,
        inner_diameter_mm: f64,
        length_mm: f64,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "lowercase")]
    enum Side {
        Inner,
        Outer,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Cut {
        side: Side,
        line: LinearProfileSpan,
        remaining_volume_pi_mm3: f64,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Fixture {
        fixture_version: u32,
        description: String,
        initial: Initial,
        initial_volume_pi_mm3: f64,
        cuts: Vec<Cut>,
        expected_spans: Vec<AnnularProfileSpan>,
    }
    let fixture: Fixture =
        serde_json::from_str(include_str!("../../../fixtures/annular-material.json")).unwrap();
    assert_eq!(fixture.fixture_version, 1);
    assert!(!fixture.description.is_empty());
    let mut budget = GeometryBudget::default();
    let mut profile = AnnularProfile::cylinder(
        fixture.initial.outer_diameter_mm,
        fixture.initial.inner_diameter_mm,
        fixture.initial.length_mm,
        &mut budget,
    )
    .unwrap();
    volume(&profile, fixture.initial_volume_pi_mm3);
    for cut in fixture.cuts {
        let previous_volume = profile.volume_mm3();
        profile = match cut.side {
            Side::Inner => profile.bore(&cut.line, &mut budget),
            Side::Outer => profile.cut_outer(&cut.line, &mut budget),
        }
        .unwrap();
        assert!(profile.volume_mm3() <= previous_volume);
        volume(&profile, cut.remaining_volume_pi_mm3);
    }
    assert_eq!(profile.spans(), fixture.expected_spans);
}

#[test]
fn facing_preserves_hole_domain_and_is_idempotent() {
    let initial = tube();
    let faced = initial
        .face_to(-5.0, &mut GeometryBudget::default())
        .unwrap();
    volume(&faced, 49875.0);
    volume(&initial, 52500.0);
    let front = faced.spans().last().unwrap();
    assert_eq!((front.z_start_mm, front.z_end_mm), (-5.0, 0.0));
    assert_eq!((front.inner_start_mm, front.outer_start_mm), (10.0, 10.0));
    assert_eq!(
        faced.face_to(-5.0, &mut GeometryBudget::default()).unwrap(),
        faced
    );
    assert_eq!(
        initial
            .face_to(0.0, &mut GeometryBudget::default())
            .unwrap(),
        initial
    );
    volume(
        &initial
            .face_to(-100.0, &mut GeometryBudget::default())
            .unwrap(),
        0.0,
    );
}

#[test]
fn facing_interpolates_both_walls_of_a_conical_span() {
    let initial = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -10.0,
            z_end_mm: 0.0,
            inner_start_mm: 5.0,
            inner_end_mm: 10.0,
            outer_start_mm: 20.0,
            outer_end_mm: 30.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    let faced = initial
        .face_to(-5.0, &mut GeometryBudget::default())
        .unwrap();
    let back = &faced.spans()[0];
    assert_eq!((back.inner_end_mm, back.outer_end_mm), (7.5, 25.0));
    let front = &faced.spans()[1];
    assert_eq!((front.inner_start_mm, front.outer_start_mm), (7.5, 7.5));
    assert_eq!((front.inner_end_mm, front.outer_end_mm), (10.0, 10.0));
    // Independent difference of outer and inner truncated-cone volumes.
    volume(
        &faced,
        5.0 / 3.0 * (400.0 + 500.0 + 625.0 - 25.0 - 37.5 - 56.25),
    );
}

#[test]
fn facing_rejects_invalid_planes_without_mutating_material() {
    let initial = tube();
    for z in [f64::NAN, f64::INFINITY, -101.0, 1.0] {
        assert_eq!(
            initial.face_to(z, &mut GeometryBudget::default()),
            Err(AnnularError::Geometry(GeometryError::InvalidGeometry))
        );
    }
    volume(&initial, 52500.0);
}

#[test]
fn cuts_after_facing_ignore_only_exactly_empty_front_intervals() {
    let initial = tube();
    let bore = line(-40.0, 2.0, 15.0, 15.0);
    let faced = initial
        .face_to(-5.0, &mut GeometryBudget::default())
        .unwrap();
    let face_then_bore = faced.bore(&bore, &mut GeometryBudget::default()).unwrap();
    let bore_then_face = initial
        .bore(&bore, &mut GeometryBudget::default())
        .unwrap()
        .face_to(-5.0, &mut GeometryBudget::default())
        .unwrap();
    volume(&face_then_bore, 45500.0);
    volume(&bore_then_face, 45500.0);
    // Empty intervals retain the boundary that existed when they were faced;
    // compare remaining material, not the arbitrary radius of zero-area spans.
    assert_eq!(&face_then_bore.spans()[..2], &bore_then_face.spans()[..2]);
    for profile in [&face_then_bore, &bore_then_face] {
        let void = profile.spans().last().unwrap();
        assert_eq!(void.inner_start_mm, void.outer_start_mm);
        assert_eq!(void.inner_end_mm, void.outer_end_mm);
    }
    let turned = faced
        .cut_outer(
            &line(-20.0, 2.0, 20.0, 20.0),
            &mut GeometryBudget::default(),
        )
        .unwrap();
    volume(&turned, 46500.0);
    let thin = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -1.0,
            z_end_mm: 0.0,
            inner_start_mm: 10.0,
            inner_end_mm: 10.0,
            outer_start_mm: 10.0 + 1e-12,
            outer_end_mm: 10.0 + 1e-12,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    assert_eq!(
        thin.bore(&line(-1.0, 0.0, 15.0, 15.0), &mut GeometryBudget::default()),
        Err(AnnularError::WallCrossing)
    );
}

#[test]
fn facing_at_span_limit_is_transactional() {
    let spans = (0..MAX_PROFILE_SPANS)
        .map(|i| AnnularProfileSpan {
            z_start_mm: i as f64 - MAX_PROFILE_SPANS as f64,
            z_end_mm: i as f64 + 1.0 - MAX_PROFILE_SPANS as f64,
            inner_start_mm: 10.0,
            inner_end_mm: 10.0,
            outer_start_mm: 25.0,
            outer_end_mm: 25.0,
        })
        .collect();
    let initial = AnnularProfile::new(spans, &mut GeometryBudget::default()).unwrap();
    assert_eq!(
        initial.face_to(-0.5, &mut GeometryBudget::default()),
        Err(AnnularError::Geometry(GeometryError::Limit))
    );
    assert_eq!(initial.spans().len(), MAX_PROFILE_SPANS);
    assert!(initial.spans().iter().all(|s| s.outer_end_mm == 25.0));
}

#[test]
fn facing_does_not_round_a_positive_tapering_wall_into_empty_material() {
    let initial = AnnularProfile::new(
        vec![AnnularProfileSpan {
            z_start_mm: -1.0,
            z_end_mm: 0.0,
            inner_start_mm: 1.0,
            inner_end_mm: 1.0,
            outer_start_mm: 1.0 + f64::EPSILON,
            outer_end_mm: 1.0,
        }],
        &mut GeometryBudget::default(),
    )
    .unwrap();
    assert_eq!(
        initial.face_to(-0.25, &mut GeometryBudget::default()),
        Err(AnnularError::Geometry(GeometryError::AmbiguousComparison))
    );
    assert!(initial.volume_mm3() > 0.0);
}
