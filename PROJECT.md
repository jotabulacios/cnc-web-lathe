# CNC Web Lathe — Product and Technical Specification

## Vision
Build an open-source, browser-based educational CNC lathe simulator. Start with learning and simulation, later add assisted programming and eventually simple 2.5D CAM. The first machine is a two-axis X/Z lathe, not a milling machine.

## Upstream and approach
Decision approved on 2026-10-20: an independent repository, with selective reuse from https://github.com/rudra496/cnc (MIT), not a synchronized fork. The original clone is a reference only. Reuse suitable UI/editor infrastructure; build a separate Rust lathe engine and explicit X/Z model. Preserve notices for each reused component in THIRD_PARTY_NOTICES.md and licenses/.

## Users and learning goals
Students learning lathe programming. Support step-by-step execution, line highlighting, toolpaths, a lathe-specific DRO, clear explanations, and educational diagnostics. Label simulated behavior and dialect limitations clearly. Never claim a simulated program is safe to run on a real machine.

## MVP acceptance scenario
A student opens the website without an account, defines cylindrical stock (e.g., diameter 50 mm, length 100 mm), selects an external turning tool, enters a short program, and steps through G00/G01 moves in X/Z. The app highlights the current block, displays positions and toolpath, explains modal behavior, and shows a 2D stock/profile preview. A 3D surface of revolution is a follow-up after the 2D result is correct.

## Initial scope
- Browser-only, static deployment where possible, no required backend or database.
- Lathe X/Z geometry, explicit diameter/radius X convention, millimeters, absolute/incremental coordinate behavior according to a documented chosen dialect.
- G00/G01 first, then G02/G03 with correct plane and arc interpretation.
- Basic spindle/feed/tool state with explicit supported-code matrix.
- Start with a documented Fanuc-inspired educational subset; do not claim generic Fanuc compatibility. Verify potentially overloaded codes (e.g., G90/G91 and G98/G99) against the selected lathe control manual before implementing.
- Tool library starts with a few generic tools; manufacturer catalogs come later with licensing review.
- A learning mode and a free-programming mode can share one interpreter.

## Out of scope for MVP
- Industrial machine safety validation, real machine connectivity, collision certification.
- G71/G70/G76, full nose-radius compensation, multiple controllers, full 3D volumetric simulation, STEP import, commercial catalogs, automatic CAM, cloud accounts.

## Architecture target
- Frontend: independent Next.js/React/TypeScript app; reuse selected UI components. SVG for the first 2D view; Three.js for a later surface of revolution.
- `cnc-core`: pure Rust library containing parser, modal state, lathe interpretation, motion/event output and geometry, with unit tests and no web dependencies.
- `cnc-wasm`: thin wasm-bindgen wrapper for the Rust library.
- TypeScript adapter consumes stable structured motions/events and drives 2D/3D rendering.
- Consider Web Worker for compute-heavy workloads after profiling.
- No premature Rust rewrite of rendering or UI.

## Design principles
- Keep machine/controller semantics distinct from geometry and rendering.
- Every supported G-code has documented behavior and tests; unsupported codes produce visible diagnostics, not silent success.
- Keep source line numbers and source blocks on generated motions.
- Use numerical tolerances, explicit units, and deterministic fixtures.
- Record dialect assumptions in documentation.
- Avoid presenting physical removal/collision estimates as validated engineering results.

## Milestones
0. Audit upstream code, verify setup/license, build compatibility matrix, write architecture and implementation plan; no sweeping changes.
1. Add minimal tested Rust `cnc-core` for G00/G01, X/Z and modal state, plus sample fixtures.
2. Integrate WASM and step-through 2D toolpath into the independent web app; keep the reference clone unchanged.
3. Add stock/profile visualization and tool model with explicit limitations.
4. Add arcs, offsets and more operations incrementally, each with reference tests.
5. Add educational examples, explanations and static deployment.
6. Later: turning cycles, catalogs, assisted programming, CAM.

## Definition of done for each milestone
- Reproducible build and tests; lint/typecheck when configured.
- At least one demonstrable example with expected output.
- Documentation of implemented and unimplemented features.
- No modifications to the reference clone; preserve attribution and verified behavior when extracting shared components.
- Small, reviewable changes.
