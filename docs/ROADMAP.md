# Roadmap, MVP and Risk Register

## 1. Scope reality check

The full brief (six physics modules, ~30 experiments, persistence, guided
learning, 3D, workers, full test pyramid) is the scope of a multi-month team
project. It will be built in phases, and each phase is reported with what was
*actually* verified. Anything not yet built is shown in the app as **Planned**,
never as a working feature.

## 2. Minimum viable product

The MVP is exactly the brief's *Definition of Done*, nothing more:

- Dashboard that lists experiments with honest availability status.
- Three experiments working mathematically: **projectile motion**,
  **pendulum**, **Newton's laws** (block + friction, table-and-pulley).
- Three-panel workspace: parameters (left), canvas (centre), measurements,
  equations and live graphs (right), transport bar (bottom).
- Play, pause, reset, single-step, speed control, elapsed sim time.
- Live graphs driven by recorded simulation data, with theoretical curves where
  an analytic solution exists.
- CSV export of recorded data.
- Automated tests passing: physics accuracy, frame-rate independence, UI,
  backend API, one end-to-end flow.
- README with installation and usage.

**Explicitly not in the MVP:** saving experiments in the UI (the backend API for
it exists from Phase 1), collisions lab (Phase 3 stretch), all of Modules B–F,
3D, guided mode, user accounts.

## 3. Phases

| Phase | Content | Exit criterion |
|-------|---------|----------------|
| 1 Foundation ✅ | Scaffold frontend + backend, design system, experiment catalog, docs, CI | Both apps build, lint, type-check, and their tests pass |
| 2 Physics engine ✅ | Vectors, Euler / semi-implicit Euler / Verlet / RK4, fixed-step simulation loop, event location, ring buffers, SciPy reference solvers + golden fixtures | Convergence-order tests pass; frame-rate-independence test passes; TS matches SciPy fixtures |
| 3 First experiments ✅ (collisions deferred) | Projectile, pendulum, Newton's laws (collisions as stretch) | Each experiment's analytic tests pass; parameters drive the model |
| 4 Visualization ✅ | Canvas renderer with world↔screen camera, vectors, free-body diagrams, uPlot live graphs, CSV export | Graphs plot recorded data; CSV round-trip test |
| — **MVP release** ✅ | Phases 1–4 + README | Definition of Done checklist all verified |
| 5 Advanced labs ✅ | Gravity/orbits (worker), waves, E&M, thermodynamics, circular motion, collisions 2D | Per-module validation tests from NUMERICAL_METHODS.md |
| 6 Education | Background, variables, guided mode, challenges with deferred answers, theory comparison panels | Content reviewed against references |
| 7 QA | Performance profiling, accessibility audit (keyboard, contrast, screen-reader labels), bug fixing | Documented profiling numbers, axe checks pass |
| 8 Finalization | README, deployment, known limitations | Fresh-clone install verified |
| Later | Save/load UI, presets, unit conversion, comparison mode, adjustable constants, 3D solar system, relativity and quantum visualizations | — |

## 4. Risk register

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Scope far exceeds a single build | Half-finished features everywhere | Strict phases; "Planned" status in UI; MVP defined by Definition of Done |
| 2 | Physics duplicated in TS and Python drifts apart | Tests validate the wrong thing | Chain of trust: analytic → SciPy → TS via golden fixtures (ARCHITECTURE §7) |
| 3 | React re-renders at simulation rate | Jank, dropped frames | Engine state outside React; throttled readouts; canvas reads state directly |
| 4 | SVG charting too slow for live data | Main thread saturated | uPlot (canvas) instead of Recharts |
| 5 | Event detection error (landing, collisions) dominates integrator error | Ranges/periods off by `v·dt` | Sub-step event location (NUMERICAL_METHODS §2, §5) |
| 6 | Friction chatter / motion reversal at `v = 0` | Unphysical behaviour | Exact stop-time event handling (§4) |
| 7 | Inelastic collapse with `e < 1` | Infinite loop / freeze | Collision cap + sticking rule, surfaced in UI |
| 8 | Slow machines fall behind real time | Spiral of death | Max steps per frame, discard and flag, never enlarge `dt` |
| 9 | Close encounters in N-body / Coulomb | Singular forces, energy explosions | Softening (documented as non-physical), timestep guidance |
| 10 | RK4 energy drift mistaken for physics | Wrong lesson taught | Energy graph labelled as numerical drift; integrator selector |
| 11 | E2E tests on canvas are brittle | Flaky CI, false confidence | Assert on DOM readouts; prove numbers in unit tests |
| 12 | Three-panel layout unusable on small screens | Mobile users locked out | Panels stack on narrow viewports; resizable panels on desktop |
| 13 | Educational text contains physics errors | Students learn wrong things | Content kept next to the tested model; equations in text must match tested code |
| 14 | Bleeding-edge toolchain (TS 7, Vite 8) incompatibilities | Broken tooling | Pinned TS 5.9.3 (typescript-eslint requires < 6.1); exact versions in lockfile |
| 15 | `create_all` cannot migrate schema | Data loss on schema change | Introduce Alembic before the first schema change once real data exists |
| 16 | Simplified models presented as reality | Scientific dishonesty | Every catalog entry carries a fidelity label and model notes |

## Phase 5 decisions

- **Shared engines.** One N-body engine serves gravity, the solar system and
  Coulomb charges; one oscillator serves SHM and resonance; one wave-string
  solver serves propagation, standing waves and sound.
- **No Three.js.** The solar system is drawn in 2D on a canvas, with orbits
  projected onto the ecliptic. A 3D scene would add a large dependency for
  no gain in the physics shown; revisit if inclinations are added.
- **No Web Workers yet.** The heaviest lab (400 hard disks) costs well under
  a millisecond per step on the main thread. Workers remain the plan if a
  lab needs thousands of bodies.
- **Simulation clock.** Each lab declares how simulated time is shown and
  paced (days, ms, ps …); physics stays in SI seconds.
- **Static configurations** (field maps, resistor networks) disable play
  and step and say why, instead of offering a button that does nothing.
- **Code splitting.** Each laboratory is a separate chunk (4–12 kB),
  loaded when opened.
