//! Tool nose radius and G41/G42 compensation (edu-lathe-v2), educational model.
//!
//! Coordinates are (Z, R) in mm. P is the programmed (imaginary) tip, after
//! geometry/wear offsets. The nose centre is C = P + o, with o = ρ·(1, 1) for
//! exterior tools and ρ·(1, −1) for the boring bar (fixed orientation per tool).
//! G42 keeps the nose to the RIGHT of the travel direction as seen in the 2D view
//! (Z right, X up); G41 to the left.
//!
//! Motions are rewritten as the CONTACT path, which is what the point-cutting
//! material model consumes:
//! - G40 with ρ > 0: the centre path offset ρ towards the material side (normal
//!   with m·o < 0). Gaps at corners become arcs around the centre vertex (the
//!   fillet a round nose leaves); overlaps are trimmed at their intersection.
//!   Cones and arcs therefore show the classic form error.
//! - G41/G42 (lines only): the contact path is the programmed contour itself;
//!   the centre is offset, rolling around convex corners.
//! - Start-up, cancel and connector moves are straight contact segments. Feed ones
//!   are marked `lead`; material reconstruction diagnoses them if they enter stock.
//!
//! `State.position` stays programmed; `tip_position` is the imaginary tip.
use crate::*;

#[derive(Clone, Copy, Debug, PartialEq)]
struct V {
    z: f64,
    r: f64,
}

impl V {
    fn of(p: Position) -> Self {
        Self {
            z: p.z_mm,
            r: p.r_mm,
        }
    }
    fn pos(self) -> Position {
        Position {
            r_mm: self.r,
            z_mm: self.z,
        }
    }
    fn add(self, o: V) -> V {
        V {
            z: self.z + o.z,
            r: self.r + o.r,
        }
    }
    fn sub(self, o: V) -> V {
        V {
            z: self.z - o.z,
            r: self.r - o.r,
        }
    }
    fn scale(self, k: f64) -> V {
        V {
            z: self.z * k,
            r: self.r * k,
        }
    }
    fn dot(self, o: V) -> f64 {
        self.z * o.z + self.r * o.r
    }
    fn cross(self, o: V) -> f64 {
        self.z * o.r - self.r * o.z
    }
    fn len(self) -> f64 {
        self.z.hypot(self.r)
    }
    fn unit(self) -> V {
        self.scale(1.0 / self.len())
    }
    /// Left normal of a direction (rotate +90° in the Z/R view).
    fn left(self) -> V {
        V {
            z: -self.r,
            r: self.z,
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Shape {
    Line,
    Arc { c: V, radius: f64, cw: bool },
}

#[derive(Clone, Debug)]
struct Piece {
    block: usize,
    span: SourceSpan,
    kind: MotionKind,
    feed: Option<f64>,
    tool: String,
    lead: bool,
    from: V,
    to: V,
    shape: Shape,
    /// Join metadata for G40 offset pieces: centre vertex at the end and the
    /// contact normal/tangent there. None for pieces that never join smoothly.
    join_end: Option<(V, V, V)>,
}

/// Chord sagitta for nose fillets, matching the profile's arc tolerance.
const FILLET_SAGITTA_MM: f64 = 0.01;

fn orientation(tool_id: &str) -> V {
    if tool_id == "boring-id" {
        V { z: 1.0, r: -1.0 }
    } else {
        V { z: 1.0, r: 1.0 }
    }
}

/// Material-side unit normal for a travel direction: the normal pointing away
/// from the nose orientation. Exact for axis-aligned directions.
fn material_normal(d: V, orient: V) -> V {
    let n = d.left();
    let (a, b) = (n, n.scale(-1.0));
    let (sa, sb) = (a.dot(orient), b.dot(orient));
    let pick = if (sa - sb).abs() <= 1e-12 * (sa.abs() + sb.abs()).max(1.0) {
        // Travel parallel to the orientation: take the normal opposite in R.
        if a.r * orient.r < 0.0 { a } else { b }
    } else if sa < sb {
        a
    } else {
        b
    };
    if pick.z == 0.0 || pick.r == 0.0 {
        V {
            z: pick.z.signum() * if pick.z == 0.0 { 0.0 } else { 1.0 },
            r: pick.r.signum() * if pick.r == 0.0 { 0.0 } else { 1.0 },
        }
    } else {
        pick.unit()
    }
}

fn angle(c: V, p: V) -> f64 {
    (p.r - c.r).atan2(p.z - c.z)
}

fn tangent(shape: Shape, from: V, to: V, at_end: bool) -> V {
    match shape {
        Shape::Line => to.sub(from).unit(),
        Shape::Arc { c, cw, .. } => {
            let p = if at_end { to } else { from };
            let u = p.sub(c).unit();
            if cw {
                V { z: u.r, r: -u.z }
            } else {
                V { z: -u.r, r: u.z }
            }
        }
    }
}

fn arc_geometry(from: V, to: V, c: V, radius: f64, cw: bool) -> Option<ArcGeometry> {
    let (a0, a1) = (angle(c, from), angle(c, to));
    let mut sweep = a1 - a0;
    if cw {
        while sweep >= 0.0 {
            sweep -= std::f64::consts::TAU;
        }
    } else {
        while sweep <= 0.0 {
            sweep += std::f64::consts::TAU;
        }
    }
    let sweep = sweep.abs();
    (sweep > 0.0 && sweep < std::f64::consts::TAU && radius > 0.0).then_some(ArcGeometry {
        center: c.pos(),
        radius_mm: radius,
        clockwise: cw,
        sweep_rad: sweep,
    })
}

/// Point of `shape` (from→to) nearest to `near` among its intersections with
/// the other piece, both restricted to their actual extents.
fn intersect(a: &Piece, b: &Piece, near: V) -> Option<V> {
    let on = |piece: &Piece, p: V| -> bool {
        match piece.shape {
            Shape::Line => {
                let d = piece.to.sub(piece.from);
                let t = p.sub(piece.from).dot(d) / d.dot(d);
                (-1e-12..=1.0 + 1e-12).contains(&t)
            }
            Shape::Arc { c, cw, .. } => {
                let total =
                    arc_geometry(piece.from, piece.to, c, 1.0, cw).map_or(0.0, |g| g.sweep_rad);
                let mut part = angle(c, p) - angle(c, piece.from);
                if cw {
                    part = -part;
                }
                part = part.rem_euclid(std::f64::consts::TAU);
                part <= total + 1e-12 || part >= std::f64::consts::TAU - 1e-12
            }
        }
    };
    let circle = |piece: &Piece| match piece.shape {
        Shape::Arc { c, radius, .. } => Some((c, radius)),
        Shape::Line => None,
    };
    let mut candidates = Vec::new();
    match (circle(a), circle(b)) {
        (None, None) => {
            let (d1, d2) = (a.to.sub(a.from), b.to.sub(b.from));
            let den = d1.cross(d2);
            if den != 0.0 {
                let t = b.from.sub(a.from).cross(d2) / den;
                candidates.push(a.from.add(d1.scale(t)));
            }
        }
        (Some((c, radius)), None) | (None, Some((c, radius))) => {
            let line = if circle(a).is_none() { a } else { b };
            let d = line.to.sub(line.from);
            let f = line.from.sub(c);
            let (qa, qb, qc) = (d.dot(d), 2.0 * f.dot(d), f.dot(f) - radius * radius);
            let disc = qb * qb - 4.0 * qa * qc;
            if disc >= 0.0 {
                for sign in [-1.0, 1.0] {
                    let t = (-qb + sign * disc.sqrt()) / (2.0 * qa);
                    candidates.push(line.from.add(d.scale(t)));
                }
            }
        }
        (Some((c1, r1)), Some((c2, r2))) => {
            let d = c2.sub(c1);
            let dist = d.len();
            if dist > 0.0 && dist <= r1 + r2 && dist >= (r1 - r2).abs() {
                let along = (r1 * r1 - r2 * r2 + dist * dist) / (2.0 * dist);
                let h = (r1 * r1 - along * along).max(0.0).sqrt();
                let base = c1.add(d.scale(along / dist));
                let perp = d.unit().left();
                candidates.push(base.add(perp.scale(h)));
                candidates.push(base.sub(perp.scale(h)));
            }
        }
    }
    candidates
        .into_iter()
        .filter(|p| p.z.is_finite() && p.r.is_finite() && on(a, *p) && on(b, *p))
        .min_by(|p, q| p.sub(near).len().total_cmp(&q.sub(near).len()))
}

struct Builder {
    pieces: Vec<Piece>,
    contact: V,
    warnings: Vec<Diagnostic>,
}

impl Builder {
    fn connector(&mut self, to: V, template: &Piece) {
        if to == self.contact {
            return;
        }
        if self.pieces.is_empty() {
            // Nothing cut yet: start the contact path where the first move needs it.
            self.contact = to;
            return;
        }
        let feed = template.kind != MotionKind::Rapid;
        self.pieces.push(Piece {
            kind: if feed {
                MotionKind::Linear
            } else {
                MotionKind::Rapid
            },
            feed: if feed { template.feed } else { None },
            lead: feed,
            from: self.contact,
            to,
            shape: Shape::Line,
            join_end: None,
            ..template.clone()
        });
        self.contact = to;
    }

    /// Chords (sagitta ≤ 0.01 mm, like the profile's arc flattening) of the
    /// shorter arc of radius `radius` around `centre`, from the contact to `to`.
    /// Chords rather than arcs so the annular model, which has no arcs, can cut it.
    fn fillet(&mut self, to: V, centre: V, radius: f64, template: &Piece) {
        let start = angle(centre, self.contact);
        let mut sweep = angle(centre, to) - start;
        if sweep > std::f64::consts::PI {
            sweep -= std::f64::consts::TAU;
        } else if sweep < -std::f64::consts::PI {
            sweep += std::f64::consts::TAU;
        }
        let step = 2.0 * (1.0 - FILLET_SAGITTA_MM / radius).max(-1.0).acos();
        let count = (sweep.abs() / step).ceil().clamp(1.0, 64.0) as usize;
        for k in 1..=count {
            let point = if k == count {
                to
            } else {
                let a = start + sweep * k as f64 / count as f64;
                V {
                    z: centre.z + radius * a.cos(),
                    r: centre.r + radius * a.sin(),
                }
            };
            self.pieces.push(Piece {
                kind: MotionKind::Linear,
                lead: false,
                from: self.contact,
                to: point,
                shape: Shape::Line,
                join_end: None,
                ..template.clone()
            });
            self.contact = point;
        }
    }

    /// Append a G40 offset piece, joining it to the previous offset piece around
    /// the shared centre vertex when possible.
    fn offset_piece(&mut self, piece: Piece, centre_start: V, radius: f64) {
        if piece.from != self.contact {
            let joinable = self
                .pieces
                .last()
                .and_then(|last| last.join_end.map(|j| (j, last.clone())));
            let mut joined = false;
            if let Some(((vertex, t1, m1), last)) = joinable
                && vertex == centre_start
                && radius > 0.0
                && last.kind != MotionKind::Rapid
            {
                let t2 = tangent(piece.shape, piece.from, piece.to, false);
                let m2 = piece.from.sub(vertex).unit();
                let (s1, s2) = (t1.cross(m1).signum(), t2.cross(m2).signum());
                let turn = t1.cross(t2);
                if s1 == s2 && turn != 0.0 {
                    if (s1 > 0.0) == (turn > 0.0) {
                        // Overlap: both contact lines are kept. The material model
                        // cuts with the minimum of both, which is the true envelope;
                        // the link is a chord of the nose disk at this vertex (air).
                        // No earlier block is rewritten, so prefixes stay exact.
                        self.pieces.push(Piece {
                            kind: MotionKind::Linear,
                            lead: false,
                            from: self.contact,
                            to: piece.from,
                            shape: Shape::Line,
                            join_end: None,
                            ..last.clone()
                        });
                        self.contact = piece.from;
                    } else {
                        // Gap: the nose rolls around the vertex at the end of the
                        // previous cut, leaving a fillet that belongs to that move.
                        self.fillet(piece.from, vertex, radius, &last);
                    }
                    joined = true;
                }
            }
            if !joined {
                let template = piece.clone();
                self.connector(piece.from, &template);
            }
        }
        if piece.to != piece.from {
            self.contact = piece.to;
            self.pieces.push(piece);
        }
    }
}

/// Rewrite motions as the nose contact path. Atomic like compilation.
pub(crate) fn apply_nose(result: &mut CompileResult, offsets: &[ToolOffset], setup_tool: &str) {
    if !result.executable {
        return;
    }
    let radius = |tool: &str| {
        offsets
            .iter()
            .find(|o| o.tool_id == tool)
            .map_or(0.0, |o| o.nose_radius_mm)
    };
    if offsets.iter().all(|o| o.nose_radius_mm == 0.0) {
        return;
    }
    if let Err(diagnostic) = rewrite(result, &radius, setup_tool) {
        result.diagnostics.push(diagnostic);
        result.executable = false;
        result.blocks.clear();
        result.motions.clear();
        result.final_state = None;
        result.initial_state.tip_position = None;
    }
}

struct Step {
    block: usize,
    motion: Motion,
    mode: Option<Compensation>,
}

fn rewrite(
    result: &mut CompileResult,
    radius: &dyn Fn(&str) -> f64,
    setup_tool: &str,
) -> Result<(), Diagnostic> {
    let steps: Vec<Step> = result
        .blocks
        .iter()
        .flat_map(|block| {
            block.motion_ids.iter().map(|&id| Step {
                block: block.id,
                motion: result.motions[id].clone(),
                mode: block.after_state.compensation,
            })
        })
        .collect();
    let initial_tool = result
        .initial_state
        .tool_id
        .clone()
        .unwrap_or_else(|| setup_tool.to_string());
    let tip0 = V::of(
        result
            .initial_state
            .tip_position
            .unwrap_or(result.initial_state.position),
    );
    let rho0 = radius(&initial_tool);
    let o0 = orientation(&initial_tool);
    let start_contact = tip0.add(o0.scale(rho0)).sub(o0.unit().scale(rho0));
    let mut b = Builder {
        pieces: Vec::new(),
        contact: start_contact,
        warnings: Vec::new(),
    };
    let mut block_tip: Vec<Option<V>> = vec![None; result.blocks.len()];
    let mut previous_mode: Option<Compensation> = None;
    let mut previous_tool = initial_tool.clone();
    // Contact start of the next compensated segment after a concave fillet.
    let mut compensated_start: Option<V> = None;
    for (i, step) in steps.iter().enumerate() {
        let m = &step.motion;
        if let (Some(before), Some(now)) = (previous_mode, step.mode)
            && (before != now || previous_tool != m.tool_id)
        {
            return Err(Diagnostic::error(
                "COMP_NO_CANCEL_MOVE",
                m.span,
                "G40 necesita un movimiento propio antes de volver a activar G41/G42 o de cambiar de herramienta.",
            ));
        }
        let zero_length = m.from == m.to && m.arc.is_none();
        if zero_length {
            // A null move neither starts nor cancels compensation.
            continue;
        }
        let previous_mode = std::mem::replace(&mut previous_mode, step.mode);
        previous_tool = m.tool_id.clone();
        let rho = radius(&m.tool_id);
        let orient = orientation(&m.tool_id);
        let o = orient.scale(rho);
        let (p0, p1) = (V::of(m.from), V::of(m.to));
        let template = Piece {
            block: step.block,
            span: m.span,
            kind: m.kind,
            feed: m.feed_mm_min,
            tool: m.tool_id.clone(),
            lead: false,
            from: p0,
            to: p1,
            shape: Shape::Line,
            join_end: None,
        };
        let side_normal = |d: V, mode: Compensation| match mode {
            Compensation::Left => d.unit().left(),
            Compensation::Right => d.unit().left().scale(-1.0),
        };
        match (previous_mode, step.mode) {
            (_, Some(mode)) => {
                let centre;
                // Compensated straight move (arcs were rejected by the interpreter).
                let d = p1.sub(p0);
                if rho > 0.0 && side_normal(d, mode).dot(material_normal(d, orient)) > 1e-9 {
                    return Err(Diagnostic::error(
                        "COMP_WRONG_SIDE",
                        m.span,
                        "Con esta herramienta la nariz quedaría del lado del material: probá el otro lado (G42 exterior hacia el plato, G41 mandrinado).",
                    ));
                }
                let next = steps
                    .get(i + 1)
                    .filter(|s| s.mode == Some(mode))
                    .map(|s| V::of(s.motion.to).sub(V::of(s.motion.from)))
                    .filter(|d| d.len() > 0.0);
                if previous_mode.is_none() {
                    // Start-up: end perpendicular to the following segment.
                    let n = side_normal(next.unwrap_or(d), mode);
                    centre = p1.add(n.scale(rho));
                    let lead = Piece {
                        lead: m.kind != MotionKind::Rapid,
                        ..template.clone()
                    };
                    b.connector(p1, &lead);
                } else {
                    let start = compensated_start.take().unwrap_or(p0);
                    if b.contact != start {
                        b.connector(start, &template);
                    }
                    let n = side_normal(d, mode);
                    centre = match next {
                        None => p1.add(n.scale(rho)),
                        Some(nd) => {
                            let n2 = side_normal(nd, mode);
                            let turn = d.cross(nd);
                            let gap = (mode == Compensation::Right) == (turn > 0.0);
                            if turn == 0.0 || gap {
                                p1.add(n2.scale(rho))
                            } else {
                                // Concave: offset lines meet inside both segments.
                                let a = Piece {
                                    from: p0.add(n.scale(rho)),
                                    to: p1.add(n.scale(rho)),
                                    ..template.clone()
                                };
                                let s = &steps[i + 1].motion;
                                let bb = Piece {
                                    from: V::of(s.from).add(n2.scale(rho)),
                                    to: V::of(s.to).add(n2.scale(rho)),
                                    ..template.clone()
                                };
                                let x = intersect(&a, &bb, p1).ok_or_else(|| {
                                    Diagnostic::error(
                                        "COMP_GOUGE",
                                        steps[i + 1].motion.span,
                                        "Con este radio de punta la compensación no entra en esta esquina: el tramo es demasiado corto.",
                                    )
                                })?;
                                // The nose cannot reach an inside corner: the contact
                                // stops at the tangent point and leaves a fillet ρ.
                                compensated_start = Some(x.sub(n2.scale(rho)));
                                x
                            }
                        }
                    };
                    let end = if compensated_start.is_some() {
                        centre.sub(n.scale(rho))
                    } else {
                        p1
                    };
                    if end != b.contact {
                        b.pieces.push(Piece {
                            from: b.contact,
                            to: end,
                            ..template.clone()
                        });
                        b.contact = end;
                    }
                    if let Some(next_start) = compensated_start {
                        b.fillet(next_start, centre, rho, &template);
                    }
                }
                let tip = centre.sub(o);
                if tip.r < 0.0 {
                    return Err(Diagnostic::error(
                        "COMP_AXIS",
                        m.span,
                        "Compensada, la punta imaginaria cruzaría el eje. Para refrentar hasta X0 cancelá con G40 antes (el refrentado sin compensación avisa del cono central).",
                    ));
                }
                block_tip[step.block] = Some(tip);
            }
            (Some(_), None) => {
                // Cancel: back to the uncompensated relation at the end point.
                let d = p1.sub(p0);
                let k = o.add(
                    material_normal(
                        if d.len() > 0.0 {
                            d
                        } else {
                            V { z: -1.0, r: 0.0 }
                        },
                        orient,
                    )
                    .scale(rho),
                );
                let lead = Piece {
                    lead: m.kind != MotionKind::Rapid,
                    ..template.clone()
                };
                let before = b.pieces.len();
                b.connector(p1.add(k), &lead);
                if b.pieces.len() > before && d.len() > 0.0 && rho > 0.0 {
                    b.pieces.last_mut().unwrap().join_end =
                        Some((p1.add(o), d.unit(), k.sub(o).scale(1.0 / rho)));
                }
            }
            (None, None) if rho == 0.0 => {
                // Ideal point: pass the programmed motion through unchanged.
                let shape = m.arc.map_or(Shape::Line, |arc| Shape::Arc {
                    c: V::of(arc.center),
                    radius: arc.radius_mm,
                    cw: arc.clockwise,
                });
                b.offset_piece(
                    Piece {
                        shape,
                        ..template.clone()
                    },
                    p0,
                    0.0,
                );
            }
            (None, None) => {
                let piece = match m.arc {
                    None => {
                        let d = p1.sub(p0);
                        let mn = material_normal(d, orient);
                        let k = o.add(mn.scale(rho));
                        let mut to = p1.add(k);
                        // Facing to the axis: a round nose still reaches X0 at its
                        // lowest point, but leaves a small centre cone (warned).
                        if rho > 0.0
                            && m.kind == MotionKind::Linear
                            && d.z == 0.0
                            && d.r < 0.0
                            && p1.r == 0.0
                        {
                            to.r = 0.0;
                            b.warnings.push(Diagnostic {
                                code: "NOSE_FACING_CENTER".into(),
                                severity: Severity::Warning,
                                span: m.span,
                                message: "Con radio de punta, el refrentado hasta X0 deja un pequeño cono en el centro que este modelo no representa.".into(),
                                point: None,
                            });
                        }
                        Piece {
                            from: p0.add(k),
                            to,
                            join_end: Some((p1.add(o), d.unit(), mn)),
                            ..template.clone()
                        }
                    }
                    Some(arc) => {
                        let c = V::of(arc.center).add(o);
                        let mid = arc_mid(p0, V::of(arc.center), arc);
                        let sigma = arc_sigma(&[p0, mid, p1], V::of(arc.center), orient).ok_or_else(|| {
                            Diagnostic::error(
                                "NOSE_ORIENTATION",
                                m.span,
                                "En este arco la punta de la herramienta cambiaría de lado de contacto: no se puede simular con radio de punta.",
                            )
                        })?;
                        let new_radius = arc.radius_mm + sigma * rho;
                        if new_radius <= 0.0 {
                            return Err(Diagnostic::error(
                                "NOSE_ARC_RADIUS",
                                m.span,
                                "El radio del arco es menor que el radio de punta: la herramienta no puede seguirlo.",
                            ));
                        }
                        let point = |p: V| c.add(p.sub(V::of(arc.center)).unit().scale(new_radius));
                        let (from, to) = (point(p0), point(p1));
                        let shape = Shape::Arc {
                            c,
                            radius: new_radius,
                            cw: arc.clockwise,
                        };
                        let end_normal = to.sub(c).unit().scale(sigma);
                        let t_end = tangent(
                            Shape::Arc {
                                c: V::of(arc.center),
                                radius: arc.radius_mm,
                                cw: arc.clockwise,
                            },
                            p0,
                            p1,
                            true,
                        );
                        Piece {
                            from,
                            to,
                            shape,
                            join_end: Some((p1.add(o), t_end, end_normal)),
                            ..template.clone()
                        }
                    }
                };
                let centre_start = p0.add(o);
                b.offset_piece(piece, centre_start, rho);
            }
        }
    }
    // Rebuild motions in order and per-block ids.
    let mut motions = Vec::with_capacity(b.pieces.len());
    for block in result.blocks.iter_mut() {
        block.motion_ids.clear();
    }
    for piece in b.pieces {
        let id = motions.len();
        let arc = match piece.shape {
            Shape::Line => None,
            Shape::Arc { c, radius, cw } => Some(
                arc_geometry(piece.from, piece.to, c, radius, cw).ok_or_else(|| {
                    Diagnostic::error(
                        "NOSE_SHORT",
                        piece.span,
                        "Geometría de punta degenerada en este tramo.",
                    )
                })?,
            ),
        };
        if piece.from.r < 0.0 || piece.to.r < 0.0 {
            return Err(Diagnostic::error(
                "NOSE_AXIS",
                piece.span,
                "Con el radio de punta, el contacto cruzaría el eje.",
            ));
        }
        let length_mm = match arc {
            Some(a) => a.radius_mm * a.sweep_rad,
            None => piece.to.sub(piece.from).len(),
        };
        result.blocks[piece.block].motion_ids.push(id);
        motions.push(Motion {
            id,
            block_id: piece.block,
            span: piece.span,
            kind: piece.kind,
            from: piece.from.pos(),
            to: piece.to.pos(),
            arc,
            feed_mm_min: if piece.kind == MotionKind::Rapid {
                None
            } else {
                piece.feed
            },
            tool_id: piece.tool,
            length_mm,
            lead: piece.lead,
            feed_mm_rev: None,
            time_s: None,
        });
    }
    result.motions = motions;
    // Blocks without motion keep the tip where the previous block left it.
    let moved: Vec<bool> = (0..result.blocks.len())
        .map(|id| {
            steps
                .iter()
                .any(|s| s.block == id && s.motion.from != s.motion.to)
        })
        .collect();
    let mut running = result.initial_state.tip_position;
    for block in result.blocks.iter_mut() {
        if let Some(tip) = block_tip[block.id] {
            block.after_state.tip_position = Some(tip.pos());
        } else if !moved[block.id] {
            block.after_state.tip_position = running;
        }
        running = block.after_state.tip_position;
    }
    for i in 1..result.blocks.len() {
        result.blocks[i].before_state.tip_position = result.blocks[i - 1].after_state.tip_position;
    }
    if let (Some(state), Some(last)) = (result.final_state.as_mut(), result.blocks.last()) {
        state.tip_position = last.after_state.tip_position;
    }
    result.diagnostics.extend(b.warnings);
    Ok(())
}

fn arc_mid(from: V, centre: V, arc: ArcGeometry) -> V {
    let a = angle(centre, from)
        + if arc.clockwise {
            -arc.sweep_rad / 2.0
        } else {
            arc.sweep_rad / 2.0
        };
    V {
        z: centre.z + arc.radius_mm * a.cos(),
        r: centre.r + arc.radius_mm * a.sin(),
    }
}

/// +1 when the contact lies outside the centre circle (radius R+ρ), −1 inside
/// (R−ρ); None if the material side flips along the arc.
fn arc_sigma(points: &[V], centre: V, orient: V) -> Option<f64> {
    // The contact normal is −sign(u·o)·u; points exactly on the tie radial
    // (u·o ≈ 0) do not decide the side.
    let signs: Vec<f64> = points
        .iter()
        .map(|p| p.sub(centre).unit().dot(orient))
        .filter(|d| d.abs() > 1e-9)
        .map(|d| -d.signum())
        .collect();
    match signs.first() {
        None => Some(1.0),
        Some(first) => signs.iter().all(|s| s == first).then_some(*first),
    }
}
