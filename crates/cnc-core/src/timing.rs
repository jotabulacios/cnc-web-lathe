//! Educational machining-time estimate (edu-lathe-v2). Not a controller cycle
//! time: no acceleration, tool-change or dwell time, and rapids use a fixed
//! didactic rate. Feed moves follow the programmed feed:
//! - G98: F mm/min, time = L / F.
//! - G99 + G97: F mm/rev at constant rpm, time = L / (F·n).
//! - G99 + G96: n depends on the diameter along the path (n = 1000·Vc/(π·D),
//!   limited by G50), so 1 / (F·n) is integrated numerically along the motion.
//!
//! Runs last, on the physical motions after cycles, offsets and nose radius.
use crate::interpreter::css_rpm;
use crate::*;

/// Didactic rapid traverse rate, mm/min.
pub const RAPID_MM_MIN: f64 = 5000.0;
/// Midpoint samples for the G96 + G99 integral.
const SAMPLES: usize = 64;

fn point_at(motion: &Motion, t: f64) -> Position {
    match motion.arc {
        None => Position {
            r_mm: motion.from.r_mm + (motion.to.r_mm - motion.from.r_mm) * t,
            z_mm: motion.from.z_mm + (motion.to.z_mm - motion.from.z_mm) * t,
        },
        Some(arc) => {
            let start =
                (motion.from.r_mm - arc.center.r_mm).atan2(motion.from.z_mm - arc.center.z_mm);
            let sweep = if arc.clockwise {
                -arc.sweep_rad
            } else {
                arc.sweep_rad
            };
            let angle = start + sweep * t;
            Position {
                r_mm: arc.center.r_mm + arc.radius_mm * angle.sin(),
                z_mm: arc.center.z_mm + arc.radius_mm * angle.cos(),
            }
        }
    }
}

fn motion_minutes(motion: &Motion, state: &State) -> f64 {
    let length = motion.length_mm;
    if motion.kind == MotionKind::Rapid {
        return length / RAPID_MM_MIN;
    }
    let feed = state.feed_mm_min.unwrap_or(0.0);
    if feed <= 0.0 {
        return 0.0;
    }
    if !state.feed_per_rev {
        return length / feed;
    }
    match state.css_m_min {
        None => length / (feed * state.spindle_rpm),
        Some(vc) => {
            let max = state.max_rpm.unwrap_or(0.0);
            (0..SAMPLES)
                .map(|i| {
                    let r = point_at(motion, (i as f64 + 0.5) / SAMPLES as f64).r_mm;
                    let rpm = css_rpm(vc, r, max);
                    (length / SAMPLES as f64) / (feed * rpm)
                })
                .sum()
        }
    }
}

/// Fills `time_s` per motion and `estimated_time_s`, and moves G99 feeds to
/// `feed_mm_rev` so `feed_mm_min` keeps meaning mm/min.
pub(crate) fn estimate_times(result: &mut CompileResult) {
    if !result.executable {
        return;
    }
    let mut total = 0.0;
    let motions = &mut result.motions;
    for block in &result.blocks {
        let state = &block.after_state;
        for &id in &block.motion_ids {
            let motion = &mut motions[id];
            let seconds = motion_minutes(motion, state) * 60.0;
            if state.feed_per_rev && motion.kind != MotionKind::Rapid {
                motion.feed_mm_rev = motion.feed_mm_min.take();
            }
            motion.time_s = Some(seconds);
            total += seconds;
        }
    }
    result.estimated_time_s = Some(total);
}
