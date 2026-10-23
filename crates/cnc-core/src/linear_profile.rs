//! Pure piecewise linear radial boundaries, shared by exterior and annular stock.
//! Coordinates are physical radii; no G-code, spindle or direction semantics here.
use crate::{MAX_MAGNITUDE, MAX_PROFILE_OPERATIONS, MAX_PROFILE_SPANS, Position};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinearProfileSpan {
    pub z_start_mm: f64,
    pub z_end_mm: f64,
    pub r_start_mm: f64,
    pub r_end_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeometryError {
    InvalidGeometry,
    Limit,
    UnrepresentableIntersection,
    AmbiguousComparison,
}

#[derive(Default)]
pub struct GeometryBudget {
    operations: usize,
}
impl GeometryBudget {
    pub(crate) fn charge(&mut self) -> Result<(), GeometryError> {
        self.operations = self.operations.saturating_add(1);
        if self.operations > MAX_PROFILE_OPERATIONS {
            Err(GeometryError::Limit)
        } else {
            Ok(())
        }
    }
}

impl LinearProfileSpan {
    fn valid(&self) -> bool {
        [
            self.z_start_mm,
            self.z_end_mm,
            self.r_start_mm,
            self.r_end_mm,
        ]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= MAX_MAGNITUDE)
            && self.z_start_mm < self.z_end_mm
            && self.r_start_mm >= 0.0
            && self.r_end_mm >= 0.0
    }

    // Evaluate locally, preserving exact stored endpoint values. All internal
    // callers supply z within this span; no global slope/intercept cancellation.
    pub(crate) fn radius(&self, z: f64) -> f64 {
        if z == self.z_start_mm {
            return self.r_start_mm;
        }
        if z == self.z_end_mm {
            return self.r_end_mm;
        }
        let t = (z - self.z_start_mm) / (self.z_end_mm - self.z_start_mm);
        (self.r_start_mm * (1.0 - t) + self.r_end_mm * t).clamp(
            self.r_start_mm.min(self.r_end_mm),
            self.r_start_mm.max(self.r_end_mm),
        )
    }

    fn part(&self, start: f64, end: f64) -> Self {
        Self {
            z_start_mm: start,
            z_end_mm: end,
            r_start_mm: self.radius(start),
            r_end_mm: self.radius(end),
        }
    }
}

/// Validated contiguous profile. Private spans preserve invariants between cuts.
#[derive(Clone, Debug, PartialEq)]
pub struct LinearProfile {
    spans: Vec<LinearProfileSpan>,
}

impl LinearProfile {
    pub fn new(
        spans: Vec<LinearProfileSpan>,
        budget: &mut GeometryBudget,
    ) -> Result<Self, GeometryError> {
        if spans.is_empty() || spans.len() > MAX_PROFILE_SPANS {
            return Err(GeometryError::InvalidGeometry);
        }
        let mut end = spans[0].z_start_mm;
        for span in &spans {
            budget.charge()?;
            if !span.valid() || span.z_start_mm != end {
                return Err(GeometryError::InvalidGeometry);
            }
            end = span.z_end_mm;
        }
        Ok(Self { spans })
    }

    pub fn spans(&self) -> &[LinearProfileSpan] {
        &self.spans
    }

    /// Return the lower envelope in the cutter's Z interval. The input remains
    /// unchanged on success and failure; the caller commits at block boundaries.
    pub fn cut(
        &self,
        cutter: &LinearProfileSpan,
        budget: &mut GeometryBudget,
    ) -> Result<Self, GeometryError> {
        self.envelope(cutter, budget, false)
    }

    /// Upper envelope for an existing hole. This is only geometry: the caller
    /// must separately enforce outer-wall, access and CNC operation constraints.
    pub fn raise(
        &self,
        cutter: &LinearProfileSpan,
        budget: &mut GeometryBudget,
    ) -> Result<Self, GeometryError> {
        self.envelope(cutter, budget, true)
    }

    fn envelope(
        &self,
        cutter: &LinearProfileSpan,
        budget: &mut GeometryBudget,
        upper: bool,
    ) -> Result<Self, GeometryError> {
        if !cutter.valid() {
            return Err(GeometryError::InvalidGeometry);
        }
        let mut out = Vec::with_capacity(self.spans.len());
        for span in &self.spans {
            budget.charge()?;
            let start = span.z_start_mm.max(cutter.z_start_mm);
            let end = span.z_end_mm.min(cutter.z_end_mm);
            if start >= end {
                push(&mut out, span.clone(), budget)?;
                continue;
            }
            let pa = span.radius(start);
            let pb = span.radius(end);
            let ca = cutter.radius(start);
            let cb = cutter.radius(end);
            let direction = if upper { -1.0 } else { 1.0 };
            let da = (pa - ca) * direction;
            let db = (pb - cb) * direction;
            checked_difference(pa, ca)?;
            checked_difference(pb, cb)?;
            if da <= 0.0 && db <= 0.0 {
                // No removal: preserve the original partition and endpoints.
                push(&mut out, span.clone(), budget)?;
                continue;
            }
            if span.z_start_mm < start {
                push(&mut out, span.part(span.z_start_mm, start), budget)?;
            }
            if da >= 0.0 && db >= 0.0 {
                push(&mut out, cutter.part(start, end), budget)?;
            } else {
                budget.charge()?;
                let t = da.abs() / (da.abs() + db.abs());
                let crossing = start + (end - start) * t;
                if !crossing.is_finite() || crossing <= start || crossing >= end {
                    return Err(GeometryError::UnrepresentableIntersection);
                }
                // Weld at one representable radius in the removal direction.
                // Lower exterior / higher interior never adds material.
                let r = if upper {
                    span.radius(crossing).max(cutter.radius(crossing))
                } else {
                    span.radius(crossing).min(cutter.radius(crossing))
                };
                let left = if da > 0.0 { cutter } else { span };
                let right = if db > 0.0 { cutter } else { span };
                push(
                    &mut out,
                    LinearProfileSpan {
                        z_start_mm: start,
                        z_end_mm: crossing,
                        r_start_mm: left.radius(start),
                        r_end_mm: r,
                    },
                    budget,
                )?;
                push(
                    &mut out,
                    LinearProfileSpan {
                        z_start_mm: crossing,
                        z_end_mm: end,
                        r_start_mm: r,
                        r_end_mm: right.radius(end),
                    },
                    budget,
                )?;
            }
            if end < span.z_end_mm {
                push(&mut out, span.part(end, span.z_end_mm), budget)?;
            }
        }
        Ok(Self { spans: out })
    }

    /// Strict penetration of a straight motion into open material interiors.
    /// Radial contact at an internal shoulder uses the smaller neighboring radius.
    pub fn penetrates(
        &self,
        from: Position,
        to: Position,
        budget: &mut GeometryBudget,
    ) -> Result<bool, GeometryError> {
        if !valid_position(from) || !valid_position(to) {
            return Err(GeometryError::InvalidGeometry);
        }
        if from.z_mm == to.z_mm {
            let z = from.z_mm;
            if z <= self.spans[0].z_start_mm || z >= self.spans.last().unwrap().z_end_mm {
                return Ok(false);
            }
            let mut radius = f64::INFINITY;
            for span in &self.spans {
                budget.charge()?;
                if span.z_start_mm <= z && z <= span.z_end_mm {
                    radius = radius.min(span.radius(z));
                }
            }
            return Ok(checked_difference(from.r_mm.min(to.r_mm), radius)? < 0.0);
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
        for span in &self.spans {
            budget.charge()?;
            let start = span.z_start_mm.max(motion.z_start_mm);
            let end = span.z_end_mm.min(motion.z_end_mm);
            if start < end {
                let a = checked_difference(motion.radius(start), span.radius(start));
                let b = checked_difference(motion.radius(end), span.radius(end));
                if a.is_ok_and(|v| v < 0.0) || b.is_ok_and(|v| v < 0.0) {
                    return Ok(true);
                }
                a?;
                b?;
            }
        }
        Ok(false)
    }

    /// Supremum over nonempty axial overlaps. Mere contact at a shoulder
    /// contributes no material to a facing operation; an empty interval is zero.
    pub fn max_radius_in(
        &self,
        z_min: f64,
        z_max: f64,
        budget: &mut GeometryBudget,
    ) -> Result<f64, GeometryError> {
        if !z_min.is_finite() || !z_max.is_finite() || z_min > z_max {
            return Err(GeometryError::InvalidGeometry);
        }
        let mut max_r = 0.0f64;
        for span in &self.spans {
            budget.charge()?;
            let start = span.z_start_mm.max(z_min);
            let end = span.z_end_mm.min(z_max);
            if start < end {
                max_r = max_r.max(span.radius(start)).max(span.radius(end));
            }
        }
        Ok(max_r)
    }

    /// Cut the front face at `z_cut`, removing all material in `[z_cut, end_of_stock]`.
    /// The interval `[z_cut, end_of_stock]` is replaced with zero-radius spans.
    /// Spans behind `z_cut` remain unchanged; spans crossing `z_cut` are clipped.
    pub fn face_to(&self, z_cut: f64, budget: &mut GeometryBudget) -> Result<Self, GeometryError> {
        let first_z = self.spans[0].z_start_mm;
        let last_z = self.spans.last().unwrap().z_end_mm;
        if !z_cut.is_finite() || z_cut < first_z || z_cut > last_z {
            return Err(GeometryError::InvalidGeometry);
        }
        if z_cut == last_z {
            return Ok(self.clone());
        }
        let mut out = Vec::with_capacity(self.spans.len() + 1);
        for span in &self.spans {
            budget.charge()?;
            if span.z_end_mm <= z_cut {
                push(&mut out, span.clone(), budget)?;
            } else if span.z_start_mm >= z_cut {
                push(
                    &mut out,
                    LinearProfileSpan {
                        z_start_mm: span.z_start_mm,
                        z_end_mm: span.z_end_mm,
                        r_start_mm: 0.0,
                        r_end_mm: 0.0,
                    },
                    budget,
                )?;
            } else {
                push(&mut out, span.part(span.z_start_mm, z_cut), budget)?;
                push(
                    &mut out,
                    LinearProfileSpan {
                        z_start_mm: z_cut,
                        z_end_mm: span.z_end_mm,
                        r_start_mm: 0.0,
                        r_end_mm: 0.0,
                    },
                    budget,
                )?;
            }
        }
        Ok(Self { spans: out })
    }
}

// Reparametrizing a clipped line can change its evaluated radius by a few ulps.
// Do not reinterpret those nonzero differences as definite removal/contact.
// This relative numerical guard is not a physical clearance: ambiguous inputs
// return an error, never air or permission to remove material. Stored equality
// remains contact, matching the existing v1 boundary convention.
pub(crate) fn checked_difference(a: f64, b: f64) -> Result<f64, GeometryError> {
    let difference = a - b;
    let guard = a.abs().max(b.abs()).max(f64::MIN_POSITIVE) * f64::EPSILON * 32.0;
    if difference != 0.0 && difference.abs() <= guard {
        Err(GeometryError::AmbiguousComparison)
    } else {
        Ok(difference)
    }
}

fn valid_position(p: Position) -> bool {
    p.r_mm.is_finite()
        && p.z_mm.is_finite()
        && p.r_mm >= 0.0
        && p.r_mm <= MAX_MAGNITUDE
        && p.z_mm.abs() <= MAX_MAGNITUDE
}

fn push(
    out: &mut Vec<LinearProfileSpan>,
    span: LinearProfileSpan,
    budget: &mut GeometryBudget,
) -> Result<(), GeometryError> {
    budget.charge()?;
    // Only merge equal cylinders. No epsilon-based geometry simplification.
    if let Some(last) = out.last_mut()
        && last.z_end_mm == span.z_start_mm
        && last.r_start_mm == last.r_end_mm
        && last.r_end_mm == span.r_start_mm
        && span.r_start_mm == span.r_end_mm
    {
        last.z_end_mm = span.z_end_mm;
        return Ok(());
    }
    if out.len() == MAX_PROFILE_SPANS {
        return Err(GeometryError::Limit);
    }
    out.push(span);
    Ok(())
}
