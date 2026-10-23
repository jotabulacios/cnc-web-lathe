//! Pure annular material geometry, independent of G-code and browser contracts.
//! An inner and outer linear radius share each axial interval. No tool shape,
//! spindle, access or CNC operation direction semantics live here.
use crate::linear_profile::{
    GeometryBudget, GeometryError, LinearProfile, LinearProfileSpan, checked_difference,
};
use crate::{MAX_MAGNITUDE, MAX_PROFILE_SPANS, Position};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnnularProfileSpan {
    pub z_start_mm: f64,
    pub z_end_mm: f64,
    pub inner_start_mm: f64,
    pub inner_end_mm: f64,
    pub outer_start_mm: f64,
    pub outer_end_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnnularError {
    Geometry(GeometryError),
    /// A proposed cut crosses the opposite material boundary. Reject the whole
    /// operation rather than clamping, adding material or inventing a breakthrough.
    WallCrossing,
}

impl From<GeometryError> for AnnularError {
    fn from(error: GeometryError) -> Self {
        Self::Geometry(error)
    }
}

/// Private spans keep 0 <= inner <= outer and a contiguous, increasing Z domain.
/// Equal inner/outer radii represent empty material, including a whole profile.
#[derive(Clone, Debug, PartialEq)]
pub struct AnnularProfile {
    spans: Vec<AnnularProfileSpan>,
}

impl AnnularProfile {
    pub fn new(
        spans: Vec<AnnularProfileSpan>,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        if spans.is_empty() || spans.len() > MAX_PROFILE_SPANS {
            return Err(GeometryError::InvalidGeometry.into());
        }
        let mut end = spans[0].z_start_mm;
        for span in &spans {
            budget.charge()?;
            let coordinates = [span.z_start_mm, span.z_end_mm];
            let radii = [
                span.inner_start_mm,
                span.inner_end_mm,
                span.outer_start_mm,
                span.outer_end_mm,
            ];
            if coordinates
                .iter()
                .any(|v| !v.is_finite() || v.abs() > MAX_MAGNITUDE)
                || radii
                    .iter()
                    .any(|v| !v.is_finite() || *v < 0.0 || *v > MAX_MAGNITUDE)
                || span.z_start_mm != end
                || span.z_start_mm >= span.z_end_mm
                || span.inner_start_mm > span.outer_start_mm
                || span.inner_end_mm > span.outer_end_mm
            {
                return Err(GeometryError::InvalidGeometry.into());
            }
            end = span.z_end_mm;
        }
        Ok(Self { spans })
    }

    /// Initial solid or tube, extending from -length to the front face at Z0.
    /// A tube requires an existing hole; this method does not model drilling.
    pub fn cylinder(
        outer_diameter_mm: f64,
        inner_diameter_mm: f64,
        length_mm: f64,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        if [outer_diameter_mm, inner_diameter_mm, length_mm]
            .iter()
            .any(|v| !v.is_finite() || *v < 0.0 || *v > MAX_MAGNITUDE)
            || outer_diameter_mm <= 0.0
            || outer_diameter_mm / 2.0 == 0.0
            || length_mm <= 0.0
            || inner_diameter_mm >= outer_diameter_mm
            || (inner_diameter_mm > 0.0 && inner_diameter_mm / 2.0 == 0.0)
        {
            return Err(GeometryError::InvalidGeometry.into());
        }
        Self::new(
            vec![AnnularProfileSpan {
                z_start_mm: -length_mm,
                z_end_mm: 0.0,
                inner_start_mm: inner_diameter_mm / 2.0,
                inner_end_mm: inner_diameter_mm / 2.0,
                outer_start_mm: outer_diameter_mm / 2.0,
                outer_end_mm: outer_diameter_mm / 2.0,
            }],
            budget,
        )
    }

    pub fn spans(&self) -> &[AnnularProfileSpan] {
        &self.spans
    }

    /// Strict penetration of a straight point trajectory into annular material.
    /// Contact on either wall is air; a solid (inner radius zero) includes its
    /// axis. At an internal axial shoulder only material common to both sides
    /// counts, matching the existing exterior profile's boundary convention.
    /// This does not check a tool body, access, spindle or any G-code semantics.
    pub fn penetrates(
        &self,
        from: Position,
        to: Position,
        budget: &mut GeometryBudget,
    ) -> Result<bool, GeometryError> {
        for p in [from, to] {
            if !p.r_mm.is_finite()
                || p.r_mm < 0.0
                || p.r_mm > MAX_MAGNITUDE
                || !p.z_mm.is_finite()
                || p.z_mm.abs() > MAX_MAGNITUDE
            {
                return Err(GeometryError::InvalidGeometry);
            }
        }
        if from.z_mm == to.z_mm {
            let z = from.z_mm;
            if z <= self.spans[0].z_start_mm || z >= self.spans.last().unwrap().z_end_mm {
                return Ok(false);
            }
            let (mut inner, mut outer) = (0.0_f64, f64::INFINITY);
            let low = from.r_mm.min(to.r_mm);
            let high = from.r_mm.max(to.r_mm);
            let (mut above_inner, mut below_outer) = (true, true);
            for span in &self.spans {
                budget.charge()?;
                if span.z_start_mm <= z && z <= span.z_end_mm {
                    let inside = boundary(span, true);
                    let outside = boundary(span, false);
                    if curve_difference(&outside, &inside, z)? == 0.0 {
                        return Ok(false);
                    }
                    let constant = |r| LinearProfileSpan {
                        r_start_mm: r,
                        r_end_mm: r,
                        ..inside.clone()
                    };
                    above_inner &= curve_difference(&constant(high), &inside, z)? > 0.0
                        || (inside.r_start_mm == 0.0 && inside.r_end_mm == 0.0 && high == 0.0);
                    below_outer &= curve_difference(&outside, &constant(low), z)? > 0.0;
                    inner = inner.max(inside.radius(z));
                    outer = outer.min(outside.radius(z));
                }
            }
            if inner >= outer {
                return Ok(false);
            }
            return Ok(above_inner && below_outer);
        }
        let (left, right) = if from.z_mm < to.z_mm {
            (from, to)
        } else {
            (to, from)
        };
        let motion = LinearProfileSpan {
            z_start_mm: left.z_mm,
            z_end_mm: right.z_mm,
            r_start_mm: left.r_mm,
            r_end_mm: right.r_mm,
        };
        let mut ambiguous = false;
        for span in &self.spans {
            budget.charge()?;
            let start = span.z_start_mm.max(left.z_mm);
            let end = span.z_end_mm.min(right.z_mm);
            if start >= end {
                continue;
            }
            let inner = boundary(span, true);
            let outer = boundary(span, false);
            if inner == outer {
                continue;
            }
            let middle = start + (end - start) / 2.0;
            if start < middle && middle < end {
                // One definite interior witness settles penetration even when
                // another point is an ambiguous reconstructed wall contact.
                let lower = curve_difference(&motion, &inner, middle);
                let upper = curve_difference(&outer, &motion, middle);
                let on_solid_axis = motion.r_start_mm == 0.0
                    && motion.r_end_mm == 0.0
                    && inner.r_start_mm == 0.0
                    && inner.r_end_mm == 0.0;
                if (lower.is_ok_and(|d| d > 0.0) || on_solid_axis) && upper.is_ok_and(|d| d > 0.0) {
                    return Ok(true);
                }
            }
            let classify = (|| {
                let (ia, ib) = (inner.radius(start), inner.radius(end));
                let lower = if motion.r_start_mm == 0.0
                    && motion.r_end_mm == 0.0
                    && inner.r_start_mm == 0.0
                    && inner.r_end_mm == 0.0
                {
                    Some((0.0, 1.0)) // Axis through a solid, not an existing hole.
                } else {
                    positive_interval(
                        curve_difference(&motion, &inner, start)?,
                        curve_difference(&motion, &inner, end)?,
                    )?
                };
                let upper = positive_interval(
                    curve_difference(&outer, &motion, start)?,
                    curve_difference(&outer, &motion, end)?,
                )?;
                Ok::<bool, GeometryError>(match (lower, upper) {
                    (Some((lo_a, hi_a)), Some((lo_b, hi_b))) => {
                        let lo = lo_a.max(lo_b);
                        let hi = hi_a.min(hi_b);
                        if lo == hi
                            && lo > 0.0
                            && lo < 1.0
                            && (outer.radius(start) > ia || outer.radius(end) > ib)
                        {
                            return Err(GeometryError::AmbiguousComparison);
                        }
                        checked_difference(hi, lo)? > 0.0
                    }
                    _ => false,
                })
            })();
            match classify {
                Ok(true) => return Ok(true),
                Ok(false) => {}
                Err(
                    GeometryError::AmbiguousComparison | GeometryError::UnrepresentableIntersection,
                ) => ambiguous = true,
                Err(error) => return Err(error),
            }
        }
        if ambiguous {
            Err(GeometryError::AmbiguousComparison)
        } else {
            Ok(false)
        }
    }

    /// Integral of pi * (outer^2 - inner^2), in cubic millimeters. Factored
    /// differences avoid subtracting two large, nearly equal frustum volumes.
    pub fn volume_mm3(&self) -> f64 {
        let mut sum = 0.0;
        let mut correction = 0.0;
        for span in &self.spans {
            let a = span.outer_start_mm;
            let b = span.outer_end_mm;
            let c = span.inner_start_mm;
            let d = span.inner_end_mm;
            let squares = (a - c) * (a + c) + (b - d) * (b + d);
            let product = (a - c) * b + c * (b - d);
            let volume = (span.z_end_mm - span.z_start_mm)
                * ((squares + product) / 3.0)
                * std::f64::consts::PI;
            // Compensated summation also keeps many small sections relevant.
            let adjusted = volume - correction;
            let next = sum + adjusted;
            correction = (next - sum) - adjusted;
            sum = next;
        }
        sum
    }

    /// Remove the front interval while retaining the inner boundary and domain.
    /// This is geometry only: CNC access, spindle and tool checks belong to the caller.
    pub fn face_to(&self, z_cut: f64, budget: &mut GeometryBudget) -> Result<Self, AnnularError> {
        let start = self.spans[0].z_start_mm;
        let end = self.spans.last().unwrap().z_end_mm;
        if !z_cut.is_finite() || z_cut < start || z_cut > end {
            return Err(GeometryError::InvalidGeometry.into());
        }
        let mut result = Vec::with_capacity(self.spans.len());
        for span in &self.spans {
            budget.charge()?;
            if span.z_end_mm <= z_cut {
                result.push(span.clone());
                continue;
            }
            let mut front = span.clone();
            if span.z_start_mm < z_cut {
                let inner = boundary(span, true).radius(z_cut);
                let outer = boundary(span, false).radius(z_cut);
                if inner == outer && !empty_span(span) {
                    // A positive linear wall cannot vanish strictly inside its
                    // span. Rounded coincidence is uncertainty, never empty air.
                    return Err(GeometryError::AmbiguousComparison.into());
                }
                let mut back = span.clone();
                back.z_end_mm = z_cut;
                back.inner_end_mm = inner;
                back.outer_end_mm = outer;
                result.push(back);
                front.z_start_mm = z_cut;
                front.inner_start_mm = inner;
            }
            front.outer_start_mm = front.inner_start_mm;
            front.outer_end_mm = front.inner_end_mm;
            result.push(front);
            if result.len() > MAX_PROFILE_SPANS {
                return Err(GeometryError::Limit.into());
            }
        }
        Self::new(result, budget)
    }

    /// Inner minimum and outer maximum of material in the proposed front band.
    pub fn facing_band(
        &self,
        z_cut: f64,
        budget: &mut GeometryBudget,
    ) -> Result<Option<(f64, f64)>, AnnularError> {
        if !z_cut.is_finite()
            || z_cut < self.spans[0].z_start_mm
            || z_cut > self.spans.last().unwrap().z_end_mm
        {
            return Err(GeometryError::InvalidGeometry.into());
        }
        let mut bounds: Option<(f64, f64)> = None;
        for span in &self.spans {
            budget.charge()?;
            if span.z_end_mm <= z_cut || empty_span(span) {
                continue;
            }
            let z = z_cut.max(span.z_start_mm);
            let inner = boundary(span, true).radius(z).min(span.inner_end_mm);
            let outer = boundary(span, false).radius(z).max(span.outer_end_mm);
            bounds = Some(match bounds {
                None => (inner, outer),
                Some((i, o)) => (i.min(inner), o.max(outer)),
            });
        }
        Ok(bounds)
    }

    /// Lower the outside radius over the cutter's axial interval.
    pub fn cut_outer(
        &self,
        cutter: &LinearProfileSpan,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        self.remove(cutter, false, budget)
    }

    /// Raise the inside radius over the cutter's axial interval.
    pub fn bore(
        &self,
        cutter: &LinearProfileSpan,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        self.remove(cutter, true, budget)
    }

    fn remove(
        &self,
        cutter: &LinearProfileSpan,
        internal: bool,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        // Validate even if all intervals are empty. Exact endpoint equality is
        // required: a thin positive wall must never be rounded into air.
        LinearProfile::new(vec![cutter.clone()], budget)?;
        if self.spans.iter().any(empty_span) {
            let mut spans = Vec::new();
            for span in &self.spans {
                budget.charge()?;
                if empty_span(span) {
                    spans.push(span.clone());
                } else {
                    let local = Self::new(vec![span.clone()], budget)?;
                    let cut = local.remove(cutter, internal, budget)?;
                    spans.extend(cut.spans);
                }
                if spans.len() > MAX_PROFILE_SPANS {
                    return Err(GeometryError::Limit.into());
                }
            }
            return Self::new(spans, budget);
        }
        let mut inner = Vec::with_capacity(self.spans.len());
        let mut outer = Vec::with_capacity(self.spans.len());
        for span in &self.spans {
            budget.charge()?;
            inner.push(LinearProfileSpan {
                z_start_mm: span.z_start_mm,
                z_end_mm: span.z_end_mm,
                r_start_mm: span.inner_start_mm,
                r_end_mm: span.inner_end_mm,
            });
            outer.push(LinearProfileSpan {
                z_start_mm: span.z_start_mm,
                z_end_mm: span.z_end_mm,
                r_start_mm: span.outer_start_mm,
                r_end_mm: span.outer_end_mm,
            });
        }
        let inner = LinearProfile::new(inner, budget)?;
        let outer = LinearProfile::new(outer, budget)?;
        let (inner, outer) = if internal {
            (inner.raise(cutter, budget)?, outer)
        } else {
            (inner, outer.cut(cutter, budget)?)
        };
        Self::join(&inner, &outer, budget)
    }

    // Merge the two sorted boundary partitions in O(n+m), keeping step values
    // on their own side of a shoulder. No interpolation across discontinuities.
    fn join(
        inner: &LinearProfile,
        outer: &LinearProfile,
        budget: &mut GeometryBudget,
    ) -> Result<Self, AnnularError> {
        let mut spans = Vec::new();
        let (mut i, mut o) = (0, 0);
        while let (Some(inside), Some(outside)) = (inner.spans().get(i), outer.spans().get(o)) {
            budget.charge()?;
            let start = inside.z_start_mm.max(outside.z_start_mm);
            let end = inside.z_end_mm.min(outside.z_end_mm);
            let span = AnnularProfileSpan {
                z_start_mm: start,
                z_end_mm: end,
                inner_start_mm: inside.radius(start),
                inner_end_mm: inside.radius(end),
                outer_start_mm: outside.radius(start),
                outer_end_mm: outside.radius(end),
            };
            if span.inner_start_mm > span.outer_start_mm || span.inner_end_mm > span.outer_end_mm {
                return Err(AnnularError::WallCrossing);
            }
            if spans.len() == MAX_PROFILE_SPANS {
                return Err(GeometryError::Limit.into());
            }
            spans.push(span);
            if inside.z_end_mm <= outside.z_end_mm {
                i += 1;
            }
            if outside.z_end_mm <= inside.z_end_mm {
                o += 1;
            }
        }
        // Both profiles originate from the same validated axial domain.
        Self::new(spans, budget)
    }
}

fn empty_span(span: &AnnularProfileSpan) -> bool {
    span.inner_start_mm == span.outer_start_mm && span.inner_end_mm == span.outer_end_mm
}

// A rounded interpolation may hide a real sub-ulp penetration. Equality is
// certified only at stored endpoints or for demonstrably coincident curves.
fn curve_difference(
    a: &LinearProfileSpan,
    b: &LinearProfileSpan,
    z: f64,
) -> Result<f64, GeometryError> {
    let difference = checked_difference(a.radius(z), b.radius(z))?;
    let exact =
        |s: &LinearProfileSpan| s.r_start_mm == s.r_end_mm || z == s.z_start_mm || z == s.z_end_mm;
    if difference == 0.0
        && !(exact(a) && exact(b))
        && a != b
        && !(a.r_start_mm == a.r_end_mm
            && b.r_start_mm == b.r_end_mm
            && a.r_start_mm == b.r_start_mm)
    {
        return Err(GeometryError::AmbiguousComparison);
    }
    Ok(difference)
}

fn boundary(span: &AnnularProfileSpan, inner: bool) -> LinearProfileSpan {
    LinearProfileSpan {
        z_start_mm: span.z_start_mm,
        z_end_mm: span.z_end_mm,
        r_start_mm: if inner {
            span.inner_start_mm
        } else {
            span.outer_start_mm
        },
        r_end_mm: if inner {
            span.inner_end_mm
        } else {
            span.outer_end_mm
        },
    }
}

/// Open interval in local parameter t where an affine function is positive.
/// Endpoints alone cannot classify a path crossing both boundaries of a tube.
fn positive_interval(a: f64, b: f64) -> Result<Option<(f64, f64)>, GeometryError> {
    if a <= 0.0 && b <= 0.0 {
        return Ok(None);
    }
    if a >= 0.0 && b >= 0.0 {
        return Ok(Some((0.0, 1.0)));
    }
    let crossing = a.abs() / (a.abs() + b.abs());
    if crossing <= 0.0 || crossing >= 1.0 {
        return Err(GeometryError::UnrepresentableIntersection);
    }
    Ok(Some(if a > 0.0 {
        (0.0, crossing)
    } else {
        (crossing, 1.0)
    }))
}
