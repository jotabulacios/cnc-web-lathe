//! Independent bounded integer/rational oracle. Partition a segment at every
//! half-plane root and test exact rational midpoints, without using the engine's
//! floating interpolation, envelope operations or positive-interval classifier.
use cnc_core::Position;
use cnc_core::annular_profile::{AnnularProfile, AnnularProfileSpan};
use cnc_core::linear_profile::{GeometryBudget, GeometryError};

#[derive(Clone, Copy)]
struct Point {
    r: i128,
    z: i128,
}
impl Point {
    fn position(self) -> Position {
        Position {
            r_mm: self.r as f64,
            z_mm: self.z as f64,
        }
    }
}

#[derive(Clone, Copy)]
struct Fraction {
    n: i128,
    d: i128,
}
impl Fraction {
    fn new(n: i128, d: i128) -> Self {
        assert_ne!(d, 0);
        if d < 0 {
            Self { n: -n, d: -d }
        } else {
            Self { n, d }
        }
    }
}

// A*r+B*z+C > 0 (or >=0 for the axis of a solid). All inputs in this test
// are small integers; intermediate cross-products are bounded far below i128.
struct HalfPlane {
    a: i128,
    b: i128,
    c: i128,
    strict: bool,
}
impl HalfPlane {
    fn at(&self, p: Point) -> i128 {
        self.a * p.r + self.b * p.z + self.c
    }
}

fn exact_penetration(planes: &[HalfPlane], from: Point, to: Point) -> bool {
    let mut events = vec![Fraction::new(0, 1), Fraction::new(1, 1)];
    for plane in planes {
        let a = plane.at(from);
        let delta = plane.at(to) - a;
        if delta != 0 {
            let t = Fraction::new(-a, delta);
            if t.n >= 0 && t.n <= t.d {
                events.push(t);
            }
        }
    }
    events.sort_by(|a, b| (a.n * b.d).cmp(&(b.n * a.d)));
    events.dedup_by(|a, b| a.n * b.d == b.n * a.d);
    events.windows(2).any(|pair| {
        let [a, b] = [pair[0], pair[1]];
        let middle = Fraction::new(a.n * b.d + b.n * a.d, 2 * a.d * b.d);
        planes.iter().all(|plane| {
            let start = plane.at(from);
            let value = start * middle.d + (plane.at(to) - start) * middle.n;
            if plane.strict { value > 0 } else { value >= 0 }
        })
    })
}

#[test]
fn integer_half_plane_oracle_checks_thousands_of_cylindrical_and_conical_paths() {
    const Z0: i128 = -100;
    const Z1: i128 = 0;
    let dz = Z1 - Z0;
    let mut checked = 0;
    let mut definite = 0;
    // Hollow/solid, two sloping walls, opposite taper, zero-thickness cone,
    // and stock tapering to an axial tip. No radial shoulder ambiguity here.
    for (inner0, inner1, outer0, outer1) in [
        (10, 10, 25, 25),
        (0, 0, 25, 25),
        (24, 24, 25, 25),
        (5, 15, 25, 20),
        (15, 5, 20, 25),
        (10, 20, 10, 20),
        (0, 0, 25, 0),
    ] {
        let profile = AnnularProfile::new(
            vec![AnnularProfileSpan {
                z_start_mm: Z0 as f64,
                z_end_mm: Z1 as f64,
                inner_start_mm: inner0 as f64,
                inner_end_mm: inner1 as f64,
                outer_start_mm: outer0 as f64,
                outer_end_mm: outer1 as f64,
            }],
            &mut GeometryBudget::default(),
        )
        .unwrap();
        let inner_slope = inner1 - inner0;
        let outer_slope = outer1 - outer0;
        let planes = [
            HalfPlane {
                a: 0,
                b: 1,
                c: -Z0,
                strict: true,
            },
            HalfPlane {
                a: 0,
                b: -1,
                c: Z1,
                strict: true,
            },
            HalfPlane {
                a: dz,
                b: -inner_slope,
                c: inner_slope * Z0 - inner0 * dz,
                strict: inner0 != 0 || inner1 != 0,
            },
            HalfPlane {
                a: -dz,
                b: outer_slope,
                c: outer0 * dz - outer_slope * Z0,
                strict: true,
            },
        ];
        let mut points = Vec::new();
        for r in [0, 5, 10, 15, 20, 24, 25, 30] {
            for z in [-120, -100, -90, -50, -10, 0, 5, 20] {
                points.push(Point { r, z });
            }
        }
        for &from in &points {
            for &to in &points {
                checked += 1;
                let expected = exact_penetration(&planes, from, to);
                match profile.penetrates(
                    from.position(),
                    to.position(),
                    &mut GeometryBudget::default(),
                ) {
                    Ok(actual) => {
                        definite += 1;
                        assert_eq!(
                            actual, expected,
                            "walls=({inner0},{inner1})/({outer0},{outer1}); ({},{}) -> ({},{})",
                            from.r, from.z, to.r, to.z
                        );
                    }
                    Err(
                        GeometryError::AmbiguousComparison
                        | GeometryError::UnrepresentableIntersection,
                    ) => {
                        // Explicit uncertainty is allowed; never reinterpret it
                        // as confirmed air or permission for material removal.
                    }
                    Err(error) => panic!("unexpected {error:?}"),
                }
            }
        }
    }
    assert_eq!(checked, 28_672);
    assert!(
        definite > 25_000,
        "too many ambiguous paths: {checked}-{definite}"
    );
    println!(
        "Annular contact oracle: {checked} paths, {definite} definite, {} explicit uncertainties.",
        checked - definite
    );
}
