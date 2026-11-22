# Architecture

Status: **Phase 2 (physics engine) complete**. Sections marked _(planned)_ describe design
decisions that are fixed now but whose code lands in a later phase.

## 1. Guiding principle

Interactive simulations run **entirely in the browser**. The backend never sits
inside the simulation loop. A projectile step costs microseconds; a network
round trip costs tens of milliseconds. Sending timesteps to a server would make
the simulation slower, less reliable, and dependent on connectivity for no
scientific gain.

The backend exists for two things that genuinely belong on a server:

1. **Persistence** – saved experiments, user presets, later learning progress.
2. **Reference computation** – high-accuracy SciPy solutions (`solve_ivp`,
   DOP853, `rtol=1e-12`) used to produce *golden fixtures* that validate the
   TypeScript engine in automated tests.

Analogy: the browser is the lab bench where experiments happen; the backend is
the filing cabinet and the calibration lab. You don't walk to the calibration
lab every time you take a reading.

## 2. Repository layout

```
SPEC/
├── frontend/                 React + TypeScript + Vite application
│   ├── src/
│   │   ├── physics/          Pure TS physics engine. No React, no DOM.
│   │   │   ├── core/         Integrators, fixed-step loop, event location
│   │   │   ├── analysis/     Analytic reference functions (elliptic K, …)
│   │   │   └── __fixtures__/ SciPy golden trajectories (generated)
│   │   ├── simulations/      One folder per experiment: model binding,
│   │   │                     parameter schema, renderer, educational text. (Phase 3)
│   │   ├── rendering/        Canvas helpers: world↔screen transform, arrows. (Phase 4)
│   │   ├── charts/           uPlot wrapper for live graphs.               (Phase 4)
│   │   ├── data/             Ring buffers, sim-time sampling. CSV export in Phase 4.
│   │   ├── components/
│   │   │   ├── ui/           Design-system primitives
│   │   │   └── layout/       App shell, workspace three-panel layout
│   │   ├── catalog/          Experiment metadata registry (what exists, its status)
│   │   ├── pages/            Route-level components
│   │   ├── stores/           Zustand stores (UI state only — see §4)
│   │   ├── services/         HTTP client for the backend
│   │   └── utils/            Formatting and small pure helpers
│   └── e2e/                  Playwright end-to-end tests
├── backend/                  FastAPI service
│   ├── app/
│   │   ├── api/              HTTP routes
│   │   ├── models/           SQLAlchemy ORM models
│   │   ├── schemas/          Pydantic request/response schemas
│   │   ├── services/         Database operations (business logic)
│   │   └── physics/          SciPy reference solvers and fixture builder
│   └── scripts/              generate_fixtures.py
│   └── tests/                Pytest suite
└── docs/                     Architecture, numerical methods, roadmap, design system
```

The suggested top-level `tests/` folder from the brief is intentionally **not**
created: tests live next to the code they test (`frontend/src/**/*.test.ts`,
`frontend/e2e/`, `backend/tests/`). A shared root test folder would separate
tests from their subject and complicate tooling for no benefit.

## 3. Separation of concerns

The brief requires six concerns to be separated. This is how each maps to code:

| Concern               | Lives in                         | Knows about                        |
|-----------------------|----------------------------------|------------------------------------|
| Physics calculations  | `physics/` models + integrators  | Numbers only (SI units)            |
| Simulation state      | `Float64Array` owned by the engine | Nothing else                     |
| Rendering             | `rendering/` + per-sim renderer  | Reads state, never writes it       |
| User interaction      | React components + Zustand       | Writes *parameters*, not state     |
| Data collection       | `data/` ring buffers             | Samples state at fixed sim-time intervals |
| Graph generation      | `charts/`                        | Reads ring buffers                 |

Dependency direction is one-way: `components → simulations → physics`.
`physics/` must never import from React, the DOM, or Zustand. This is enforced
by an ESLint `no-restricted-imports` rule on `src/physics/**` and `src/data/**`.

## 4. Simulation loop (`physics/core/loop.ts`)

Fixed-timestep accumulator ("Fix Your Timestep" pattern):

```
each animation frame (requestAnimationFrame):
    realElapsed = min(now - lastFrame, 0.25 s)        # avoid huge jumps after tab switch
    accumulator += realElapsed × speedMultiplier
    steps = 0
    while accumulator ≥ dt and steps < maxStepsPerFrame:
        state = integrate(state, dt)                  # physics, fixed dt
        sampleIfDue(state)                            # data collection on sim-time schedule
        accumulator -= dt; steps += 1
    if steps == maxStepsPerFrame: discard remainder, flag "running slower than requested"
    render(state)                                     # rendering, variable rate
```

Consequences, deliberately chosen:

- **Frame-rate independence.** Physics only ever sees `dt`. A 30 Hz and a 144 Hz
  display produce bit-identical trajectories for the same simulated time. This
  will be tested directly by driving the loop with different frame sequences.
- **Speed multiplier changes how much sim time passes per real second, not `dt`.**
  Changing speed therefore never changes accuracy.
- **No spiral of death.** If the machine cannot keep up, the simulation slows
  down and *says so* in the UI, instead of silently increasing `dt`.
- **Step button** advances exactly one `dt` (or a fixed number of steps).

### Why simulation state is not in Zustand

Putting per-step state in a React store would trigger React re-renders up to
thousands of times per second. Instead:

- The engine owns state in plain typed arrays, mutated in place.
- Canvas rendering reads that state directly inside `requestAnimationFrame`.
- Numeric readouts subscribe at a throttled rate (~10 Hz), which is faster
  than a human can read digits anyway.
- Zustand holds only things a human changes: chosen experiment, parameters,
  play/pause, speed, panel preferences.

### Web Workers

Not used for the MVP experiments. A single projectile, pendulum, or block
system integrates in well under 1 % of a frame budget; a worker would add
message-passing complexity and latency without measurable benefit. Workers are
planned for the N-body and ideal-gas simulations (hundreds to thousands of
interacting bodies), where the cost is real. The engine API is designed as
"state in, state out" so that moving a model into a worker requires no change
to the model itself.

## 5. Data collection (`data/`, Phase 2) and graphs (Phase 4)

- Each recorded channel is a fixed-capacity ring buffer (`Float64Array`).
  Memory is bounded regardless of run length; the oldest samples are dropped.
- Sampling happens on a **simulation-time** schedule (e.g. every 10 ms of sim
  time), not per frame, so recorded data is also frame-rate independent.
- Graph library: **uPlot** instead of Recharts. Recharts renders SVG nodes per
  point and re-renders through React; with several live series at 10–30 Hz
  updates it becomes the bottleneck. uPlot draws to Canvas, is ~50 KB, and is
  designed for streaming time series. The brief permits "another suitable
  graphing library"; this is the reason for exercising that option.
- Theoretical curves are computed from analytic solutions (where they exist)
  and drawn dashed alongside simulated data, never substituted for it.

## 6. Backend

- **FastAPI** app created by an application factory (`create_app`) so tests
  can build isolated instances against a temporary database.
- **SQLAlchemy 2.0** typed ORM. Sessions are provided per request through a
  dependency.
- **SQLite** by default (`sqlite:///./physics_lab.db`). The database URL comes
  from the `PHYSICS_LAB_DATABASE_URL` environment variable.
- **PostgreSQL readiness:** only portable column types are used (`JSON`,
  `DateTime(timezone=True)`, `String`, `Integer`). No SQLite-specific SQL.
  Tables are created with `create_all` at startup for development. **Before the
  first schema change after real user data exists, Alembic migrations must be
  introduced** — `create_all` cannot alter existing tables. This is a known,
  deliberate deferral, not an oversight.
- **Saved experiments** store parameters as a JSON object together with
  `experiment_type` and `schema_version`. The backend validates the envelope
  (type, size, JSON-object shape); the frontend validates experiment-specific
  parameters on load and migrates old `schema_version`s. Rationale: parameter
  schemas evolve with the simulations, which live in the frontend; duplicating
  every schema in Python would create two sources of truth that drift.

## 7. Two languages, one physics: the duplication risk

Some physics will exist in both TypeScript (interactive engine) and Python
(reference solvers). Two implementations of the same equations can silently
disagree. Mitigation:

1. Python reference solvers are validated against **analytic solutions** in
   Pytest.
2. Python generates **golden fixture files** (JSON trajectories) committed to
   the repository.
3. Vitest loads those fixtures and checks the TypeScript engine against them
   with documented tolerances.

So the chain of trust is: analytic solution → SciPy reference → TypeScript
engine. Neither implementation is trusted on its own.

## 8. Testing strategy

| Layer               | Tool        | What it proves                                         |
|---------------------|-------------|--------------------------------------------------------|
| Physics engine      | Vitest      | Numerical results vs analytic solutions, conservation, frame-rate independence |
| Utilities/components| Vitest + Testing Library | Formatting, UI behaviour                    |
| Backend             | Pytest      | API contracts, persistence, reference solver accuracy  |
| End to end          | Playwright  | The real built app loads and works in a browser        |

Canvas pixels are **not** asserted in end-to-end tests (brittle, and pixels do
not prove physics). Instead, numeric readouts are exposed in the DOM and
end-to-end tests assert on those, while correctness of the numbers is proven at
the unit level.
