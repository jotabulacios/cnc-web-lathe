use serde::{Deserialize, Serialize};

pub const DIALECT: &str = "edu-lathe-v1";
pub const MAX_SOURCE_BYTES: usize = 256 * 1024;
pub const MAX_BLOCKS: usize = 10_000;
pub const MAX_MAGNITUDE: f64 = 1_000_000_000.0;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Position {
    pub r_mm: f64,
    pub z_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stock {
    pub diameter_mm: f64,
    pub length_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Setup {
    pub x_convention: String,
    pub initial_position: Position,
    pub stock: Stock,
    pub tool_id: String,
    /// edu-lathe-v2 only; v1 rejects a table instead of ignoring it (null = absent).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_offsets: Option<Vec<crate::ToolOffset>>,
    /// Nominal chuck jaws for the educational collision check (absent = defaults).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jaws: Option<ChuckJaws>,
}

/// Nominal chuck jaws gripping the raw stock from the chuck end (Z = −length).
/// Educational obstacle only; it never changes the remaining material.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChuckJaws {
    /// Stock length held inside the jaws, from Z = −length toward the face. 0 = only the chuck face.
    pub grip_length_mm: f64,
    /// Radial height of the jaws above the raw stock diameter.
    pub jaw_height_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompileRequest {
    pub api_version: u32,
    pub dialect: String,
    pub source_revision: u32,
    pub source: String,
    pub setup: Setup,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpan {
    pub line: usize,
    pub column_start: usize,
    pub column_end: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: String,
    pub severity: Severity,
    pub span: SourceSpan,
    pub message: String,
    /// Optional location in the Z/R plane (physical radius), e.g. a collision point.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub point: Option<Position>,
}

impl Diagnostic {
    pub(crate) fn error(code: &str, span: SourceSpan, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            severity: Severity::Error,
            span,
            message: message.into(),
            point: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MotionKind {
    Rapid,
    Linear,
    #[serde(rename = "arc-cw")]
    ArcCw,
    #[serde(rename = "arc-ccw")]
    ArcCcw,
}

impl MotionKind {
    pub fn is_arc(self) -> bool {
        matches!(self, Self::ArcCw | Self::ArcCcw)
    }
}

/// Circular interpolation geometry resolved by the interpreter.
/// `sweep_rad` is the absolute sweep in (0, 2π); `clockwise` is the direction
/// seen from +Y with Z to the right and X (radius) up.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArcGeometry {
    pub center: Position,
    pub radius_mm: f64,
    pub clockwise: bool,
    pub sweep_rad: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SpindleDirection {
    Cw,
    Ccw,
}

/// Nose radius compensation side (edu-lathe-v2): G41 left, G42 right of travel
/// as seen in the 2D view (Z right, X up).
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Compensation {
    #[serde(rename = "g41")]
    Left,
    #[serde(rename = "g42")]
    Right,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub position: Position,
    pub motion: Option<MotionKind>,
    pub feed_mm_min: Option<f64>,
    pub spindle_rpm: f64,
    pub spindle_on: bool,
    pub spindle_direction: SpindleDirection,
    pub ended: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool_id: Option<String>,
    /// Physical tip after offsets; present only when the setup has an offset table.
    /// `position` stays the programmed point, as a control's absolute display.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tip_position: Option<Position>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub compensation: Option<Compensation>,
    /// G96 constant surface speed in m/min (None = G97, `spindle_rpm` direct).
    /// With G96, `spindle_rpm` is the speed at the current diameter.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub css_m_min: Option<f64>,
    /// G50 S spindle limit in rpm.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_rpm: Option<f64>,
    /// G99: `feed_mm_min` holds F in mm/rev instead of mm/min.
    #[serde(skip_serializing_if = "std::ops::Not::not", default)]
    pub feed_per_rev: bool,
}

impl State {
    pub(crate) fn initial(position: Position) -> Self {
        Self {
            position,
            motion: None,
            feed_mm_min: None,
            spindle_rpm: 0.0,
            spindle_on: false,
            spindle_direction: SpindleDirection::Cw,
            ended: false,
            tool_id: None,
            tip_position: None,
            compensation: None,
            css_m_min: None,
            max_rpm: None,
            feed_per_rev: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Motion {
    pub id: usize,
    pub block_id: usize,
    pub span: SourceSpan,
    pub kind: MotionKind,
    pub from: Position,
    pub to: Position,
    /// Present only for `arc-cw`/`arc-ccw` motions.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub arc: Option<ArcGeometry>,
    pub feed_mm_min: Option<f64>,
    pub tool_id: String,
    pub length_mm: f64,
    /// Nose start-up/cancel/connector feed move: diagnosed if it enters stock.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub lead: bool,
    /// G99 feed in mm/rev (then `feed_mm_min` is None). edu-lathe-v2 only.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub feed_mm_rev: Option<f64>,
    /// Educational time estimate in seconds (edu-lathe-v2 only).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub time_s: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlockKind {
    State,
    Motion,
    End,
}

/// Canned-cycle role of a block (edu-lathe-v2), for explanation only.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CycleKind {
    RoughingSetup,
    Roughing,
    Finishing,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: usize,
    pub span: SourceSpan,
    pub source: String,
    pub before_state: State,
    pub after_state: State,
    pub motion_ids: Vec<usize>,
    pub kind: BlockKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycle: Option<CycleKind>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    pub api_version: u32,
    pub dialect: String,
    pub source_revision: u32,
    pub executable: bool,
    pub initial_state: State,
    pub blocks: Vec<Block>,
    pub motions: Vec<Motion>,
    pub diagnostics: Vec<Diagnostic>,
    pub final_state: Option<State>,
    /// Sum of motion time estimates (edu-lathe-v2, executable results only).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub estimated_time_s: Option<f64>,
}
