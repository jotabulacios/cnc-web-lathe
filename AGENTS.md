# Instructions for coding agents

Read `PROJECT.md` before modifying code. This is an educational browser-based CNC lathe simulator, initially X/Z, built as an independent repository with selective, attributed UI reuse from a milling simulator.

- Inspect the actual repository before naming files, assuming architecture, or making implementation decisions.
- Prioritize the lathe MVP; do not implement milling enhancements, CAM, cloud services, or large redesigns unless requested.
- Keep the reference clone unchanged; test each extracted component in the independent app. Prefer small commits/PR-sized changes.
- Separate Rust core (pure logic), WASM boundary, TypeScript adapter, and UI/rendering.
- Test CNC semantics with deterministic fixtures; document the chosen controller dialect and X diameter/radius convention.
- Do not silently ignore unsupported G/M codes; surface diagnostics.
- Never describe output as machine-safe or industrially validated.
- Preserve upstream license and attribution. Check licenses before importing catalog data or third-party code.
- Run available checks after edits; report what passed, failed, or could not run.
- For architecture changes, present tradeoffs and an implementation plan before substantial refactoring.
- Do not push, deploy, or modify upstream remotes without explicit approval.
