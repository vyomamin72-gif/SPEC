# Numerical Methods

Status: **Phase 2 — integrators, event location and reference solvers are
implemented and tested** (`frontend/src/physics/core/`,
`backend/app/physics/`). Experiment-specific sections (§2–§6) describe the
methods the Phase 3+ experiments will use. Measured figures are in §8.

All internal quantities are **SI units** (m, kg, s, rad, N, J, C, K). Display
units are a presentation concern only.

---

## 0. Two kinds of error — kept separate everywhere

Every comparison in this project distinguishes:

1. **Model error** – the equations themselves are an approximation of nature
   (e.g. the small-angle pendulum, a 2D gas standing in for a 3D gas, no air
   resistance). Shrinking the timestep does **not** reduce this.
2. **Numerical error** – the integrator's deviation from the exact solution of
   *the chosen equations*. Shrinking the timestep **does** reduce this, at a
   rate set by the method's order.

Example: comparing a simulated nonlinear pendulum at 30° to `T₀ = 2π√(L/g)`
shows a ~1.7 % discrepancy. That is not a bug or an integrator failure; it is
the small-angle model being wrong at 30°. The correct test of the integrator is
against the *exact* nonlinear period (elliptic integral, §3). The UI will label
which kind of discrepancy the user is looking at.

---

## 1. Integrators (Phase 2)

| Method                     | Order | Symplectic | Use                                    |
|----------------------------|-------|------------|----------------------------------------|
| Explicit Euler             | 1     | No         | Teaching only: shows energy blow-up    |
| Semi-implicit (symplectic) Euler | 1 | Yes     | Teaching; cheap bounded-energy demo    |
| Velocity Verlet / leapfrog | 2     | Yes        | Gravity, Coulomb N-body, long runs     |
| Classical Runge–Kutta 4    | 4     | No         | Smooth low-dimensional ODEs (projectile, pendulum) |

Why not one method for everything: RK4 is very accurate per step but is not
symplectic, so over very long runs of conservative systems its energy error
drifts in one direction. Verlet is less accurate per step but its energy error
stays bounded and oscillatory forever, and it conserves angular momentum for
central forces to round-off. Accuracy over a few periods → RK4. Qualitative
correctness over thousands of orbits → Verlet.

Analogy: RK4 is a sprinter with excellent form who slowly veers off the lane
over a marathon; Verlet is a slightly less elegant runner who never leaves the
lane.

### Testing integrators: verify the *order*, not just a tolerance

A fixed tolerance can pass by luck. The integrator tests will additionally run
the same problem at `dt` and `dt/2` and measure the observed convergence order
`p = log₂(e(dt) / e(dt/2))`, which must be close to the theoretical order
(1, 2 or 4). An implementation bug almost always shows up as the wrong order.

---

## 2. Projectile motion — RK4 + event location

**Equations (no drag):** `ẍ = 0`, `ÿ = −g`.

**Why RK4 is exact here:** the system is linear with a nilpotent matrix
(`A³ = 0` in augmented form), so the exact flow `exp(A·dt)` is a finite
polynomial that RK4 reproduces term for term. Remaining error is floating-point
round-off only (~10⁻¹² relative over 10⁴ steps). This gives a sharp test: any
error above round-off is a bug.

**Landing detection.** The naive approach ("stop at the first step where
y < 0") produces a range error of up to `vₓ·dt` — 0.2 m for 20 m/s at 10 ms,
far larger than the integrator error. Instead, when `y` changes sign within a
step, the landing time is found by re-integrating from the start of that step
with a trial sub-step `h` and solving `y(h) = 0` by bracketed secant iteration
(Illinois method) to |Δt| < 10⁻¹² s. This is accurate to the integrator's
order, not to `dt`.

**Analytic references** (launch height `h₀`, speed `v₀`, angle `θ`):

- Flight time `T = (v₀ sin θ + √((v₀ sin θ)² + 2 g h₀)) / g`
- Range `R = v₀ cos θ · T`
- Maximum height `H = h₀ + (v₀ sin θ)² / (2g)`
- Same-height case `h₀ = 0`: `R = v₀² sin 2θ / g`, maximised at θ = 45°.

**Air resistance:**

- *Quadratic drag* (realistic for a ball in air at Reynolds numbers ~10³–10⁵):
  `F = −½ ρ C_d A |v| v`. No closed-form 2D solution exists. Validation:
  (a) 1D vertical fall from rest has the exact solution
  `v(t) = v_t tanh(g t / v_t)`, `v_t = √(2mg / (ρ C_d A))`;
  (b) 2D trajectories compared with SciPy DOP853 golden fixtures.
- *Linear drag* `F = −b v` (Stokes regime, tiny/slow particles) has a closed
  form and is offered as a validation mode:
  `vₓ = vₓ₀ e^(−t/τ)`, `v_y = (v_y0 + gτ) e^(−t/τ) − gτ`, `τ = m/b`.

Model limitations to state in the UI: constant `C_d` (real `C_d` depends on
Reynolds number), no wind, no spin (no Magnus force), flat non-rotating Earth,
uniform `g`.

---

## 3. Pendulum — RK4 on (θ, ω), exact elliptic-integral reference

**Equations:** point mass on a massless rigid rod,
`θ̈ = −(g/L) sin θ − γ θ̇`, with `γ = b/m` for a linear drag force `−b·v` on
the bob.

Note the honest consequence: **without damping, mass has no effect on the
motion.** With linear damping defined as a force coefficient `b`, mass enters
only through `γ = b/m`. The UI will show this rather than give the mass slider
a fake effect.

**Simple (linearised) mode:** `θ̈ = −(g/L) θ − γ θ̇`, integrated with the same
RK4, analytic solution available.

**Period references:**

- Small-angle: `T₀ = 2π √(L/g)`
- Exact undamped, amplitude θ₀: `T = 4 √(L/g) K(k)`, `k = sin(θ₀/2)`, with
  `K(k) = π / (2·AGM(1, √(1−k²)))` computed by the arithmetic–geometric mean
  (quadratic convergence; ~6 iterations to machine precision).
- Series check: `T/T₀ ≈ 1 + θ₀²/16 + 11θ₀⁴/3072`.
- Damped small-angle: `ω_d = √(g/L − γ²/4)` (underdamped case only).

**Period measurement in the simulation:** successive same-direction zero
crossings of θ, with the crossing time found by cubic Hermite interpolation
using θ and ω at both ends of the step (third-order accurate). This is a
*measurement* of the simulated motion, not a formula.

**Energy behaviour — expected numbers, not hand-waving.** For the harmonic
oscillator, RK4's per-step energy factor is `1 − (ωh)⁶/72 + …`. With
`ω ≈ 3 rad/s`, `h = 1 ms`: ~10⁻¹⁷ per step, below double-precision round-off.
So at the default timestep RK4 energy error is dominated by round-off and is
effectively invisible. Explicit Euler, by contrast, grows energy by a factor
`1 + (ωh)²` per step: roughly +9 % over 10 s at the same `h`. The pendulum lab
will offer an integrator selector specifically so this difference can be
observed, and the energy graph shows the numerical drift as numerical drift.

**Initial-condition guard:** θ₀ restricted to (−π, π). At θ₀ → π the period
diverges (unstable equilibrium); the exact formula and the measurement both
reflect this and the UI must not display a meaningless finite "period".

---

## 4. Newton's laws — exact piecewise-constant-acceleration update

**Scenarios planned:** (a) block on a horizontal surface with applied force and
friction; (b) block on a table pulled by a hanging mass over an ideal pulley
(massless, frictionless pulley; massless, inextensible string).

**Why not RK4:** Coulomb friction is discontinuous at `v = 0` (static ↔
kinetic). High-order methods assume smoothness and gain nothing across a
discontinuity; they can also "chatter" around `v = 0`. Between events the
acceleration is constant, so the exact update is
`x += v·dt + ½ a dt²`, `v += a·dt`.

**Friction algorithm per step:**

1. If at rest and `|F_applied| ≤ μ_s N`: static friction balances the applied
   force exactly, `a = 0`.
2. Otherwise kinetic friction `μ_k N` opposes the (impending) motion.
3. If velocity would change sign within the step, the stop time
   `t_s = −v/a` is computed exactly; the block is advanced to `t_s`, set to
   rest, and step 1 is re-evaluated for the remainder of the step.

Friction can therefore never reverse motion, which is the classic numerical
artefact of naive friction implementations.

**Pulley system analytic reference:** `a = (m₂ g − μ_k m₁ g)/(m₁ + m₂)`,
tension `T = m₂ (g − a)`. Free-body diagrams draw these computed forces.

---

## 5. 1D collisions — event-driven, exact

Between collisions bodies on a frictionless track move at constant velocity,
so the time of the next collision is computed exactly (`gap / closing speed`),
not detected after overlap. Response with coefficient of restitution `e`:

```
v₁' = (m₁v₁ + m₂v₂ + m₂ e (v₂ − v₁)) / (m₁ + m₂)
v₂' = (m₁v₁ + m₂v₂ + m₁ e (v₁ − v₂)) / (m₁ + m₂)
```

Momentum is conserved to round-off for every `e`. Kinetic energy loss is
exactly `½ μ (1 − e²) (v₁ − v₂)²` with reduced mass `μ`. Both are tested.

**Known hazard — inelastic collapse.** With `e < 1` and three or more bodies,
the number of collisions can become unbounded in finite time. Safeguard: cap
collisions per step; when the cap is hit, bodies in contact with relative
speed below a threshold are treated as stuck together, and the UI reports that
the safeguard engaged. Simultaneous three-body contacts (Newton's cradle) are
resolved sequentially; this is a modelling choice and is documented as such —
real cradles depend on contact elasticity and are not perfectly described by
instantaneous pairwise collisions.

---

## 6. Later modules — method selection (Phase 5+)

| Module                 | Method                                                  | Key validation                          |
|------------------------|---------------------------------------------------------|-----------------------------------------|
| Circular motion        | RK4 on θ with rigid-tether constraint; tension computed from constraint | `T = mω²r`, tangential release on cut |
| Gravity / solar system | Velocity Verlet, Plummer softening `ε`                  | Kepler III period, bounded energy, angular momentum to round-off |
| Mass–spring SHM        | RK4 (and Verlet for comparison)                         | `x = A cos(ωt + φ)`                     |
| 1D waves / standing waves | Explicit leapfrog finite differences, CFL `c·dt/dx ≤ 1` | Mode frequencies `fₙ = n c / 2L`     |
| 2D interference        | Analytic superposition of point sources (exact for linear waves) | Fringe spacing `λD/d`          |
| Coulomb interactions   | Velocity Verlet + softening                             | Force vs `kq₁q₂/r²`, momentum           |
| Field lines            | RK4 streamline tracing along `E/|E|`                    | Symmetry, flux                          |
| DC circuits            | Modified Nodal Analysis, Gaussian elimination with partial pivoting | Series/parallel formulae, Kirchhoff laws |
| RC transients          | Backward Euler (A-stable)                               | `V(t) = V₀(1 − e^(−t/RC))`              |
| Ideal gas              | 2D hard-disk molecular dynamics in a Web Worker         | `PA = NkT` (2D), Maxwell–Boltzmann 2D speed distribution |
| Special relativity     | Analytic Lorentz transformations                        | Invariant interval                      |
| Double slit            | Analytic Fraunhofer intensity + Monte Carlo sampling of detections (Born rule) | Fringe positions |
| Photoelectric effect   | Phenomenological model `K_max = hf − φ`                 | Stopping potential slope `h/e`          |

### Honesty labels for these modules

- **Gas:** a 2D gas of hard disks is a *real Newtonian simulation* but of a 2D
  analogue system. Its equation of state is `PA = NkT` only at low density; at
  higher packing it deviates (Henderson equation of state for hard disks). The
  lab will show measured, ideal, and Henderson predictions side by side.
- **Softening** in gravity and Coulomb simulations modifies the physics at
  separations below `ε`. It prevents numerical blow-up at close approach; it
  is not a property of nature, and the UI will say so.
- **Double slit:** we sample a known analytic probability distribution. We do
  not evolve a wavefunction. The pattern is the experimentally validated
  prediction; the *simulation* is of the statistics of detection, not of the
  quantum dynamics.
- **Photoelectric effect:** the threshold law is experimentally validated; the
  electron energy distribution below `K_max` and the efficiency model are
  simplified assumptions.
- **Relativity:** Lorentz transformations are exact within special relativity
  and experimentally confirmed (e.g. muon lifetimes, atomic clocks). Note that
  length contraction is what is *measured*, not what a camera would *see*
  (Terrell–Penrose rotation); the visualisation will state this.

---

## 7. Tolerance policy for automated tests

Each numerical test documents why its tolerance is what it is. Three tiers:

| Tier                     | Typical relative tolerance | Justification                                         |
|--------------------------|----------------------------|-------------------------------------------------------|
| Exact-by-construction    | 10⁻⁹                       | Method is exact for the equations; only round-off (~N·ε_machine) remains |
| Convergent approximation | derived from `C·dtᵖ`       | Bound estimated from the observed error constant and order |
| Statistical (gas, Monte Carlo) | several standard errors | Finite-sample fluctuations, `∝ 1/√N`              |

Tolerances are never widened to make a failing test pass without recording the
reason in the test itself.

---

## 8. Measured results (Phase 2)

All figures are produced by the automated tests and can be reproduced with
`pnpm test` (frontend) and `uv run pytest` (backend).

**Reference solvers** (SciPy DOP853, rtol = atol = 1e-12), validated against
analytic solutions to 1e-9 or better: linear damped pendulum, exact nonlinear
period (elliptic integral) at θ₀ = 0.05, 1.0, 2.5 and 3.0 rad, vertical fall
with quadratic drag (tanh solution), drag-free range and flight time.

**Observed convergence order** on the damped nonlinear pendulum
(θ₀ = 2.5 rad, γ = 0.2 s⁻¹, T = 5 s) matches theory within ±0.15 for all four
integrators: Euler 1, semi-implicit Euler 1, velocity Verlet 2, RK4 4.
Velocity Verlet remains second order with this velocity-dependent damping force,
but is not symplectic in that case.

**Exact discrete identities** on the harmonic oscillator (ωh = 0.1), verified
to round-off:

| Method | Identity |
|---|---|
| Explicit Euler | energy × (1 + ω²h²) every step (grows) |
| RK4 | energy × \|R(iωh)\|² every step (decays very slowly) |
| Semi-implicit Euler | conserves v² + ω²q² − hω²qv exactly |
| Velocity Verlet | conserves v² + ω²q²(1 − ω²h²/4) exactly |

**Accuracy against the SciPy fixtures** (RK4, dt = 1 ms):

| Problem | Max error | Tolerance |
|---|---|---|
| Damped nonlinear pendulum, 10 s | 3.9 × 10⁻¹¹ | 10⁻⁹ |
| Projectile with quadratic drag, to landing | 2.4 × 10⁻¹⁰ | 10⁻⁸ |
| Landing time (event location) | 9.7 × 10⁻¹³ s | 10⁻⁹ s |
| Landing range | 1.6 × 10⁻¹¹ m | 10⁻⁸ m |

**Frame-rate independence:** the same 3.0004 s run split into 30 Hz,
144 Hz and randomly jittered frames gives the same step count and
bit-identical state.

### Golden fixtures

`backend/scripts/generate_fixtures.py` writes the reference trajectories to
`frontend/src/physics/__fixtures__/`. A backend test fails if the committed
files no longer match the generator, so the two sides cannot silently diverge.

## 9. Phase 5 — what each new lab is validated against

| Lab | Method | Verified in tests |
|---|---|---|
| Collisions | Event-driven, exact contact times | Momentum to 1e-12; ΔK = ½μ(1−e²)Δv²; contact at the exact time |
| Circular motion | RK4 on θ (exact for constant force), free flight after cut | T = mω²r; ω = ω₀ + αt; tangential escape |
| Gravity, solar system | Velocity Verlet, optional Plummer softening | Return after one Kepler period (1e-5); energy bounded over 100 orbits; L and p to 1e-12; planetary periods vs Kepler III and observed periods (0.3 %) |
| SHM, resonance | RK4 | Exact driven-damped solution (1e-9); settled amplitude vs resonance curve (1e-4) |
| Waves, standing waves, sound | Leapfrog finite differences | Exact d'Alembert at C = 1 (1e-12); mode frequency vs grid dispersion (1e-5); fixed/free reflection signs; absorbing boundary < 1 %; unstable above CFL; sound wavelength (1 %) and pressure amplitude (2 %) |
| Interference | Analytic superposition | Fringe spacing → λD/d in the far field; minimum on axis for Δφ = π |
| Charges | N-body with Coulomb coupling, RK4 | Speed from energy conservation (1e-9) |
| Electric field | Superposition, RK4 field lines | kq/r²; Gauss's law flux = q/ε₀ (1e-5); dipole lines end on −q |
| Magnetic field | Biot–Savart (long wires), Boris pusher | μ₀I/2πr; cyclotron radius and period (1e-5); speed to 1e-13; E×B drift (1e-3) |
| Induction | Exact dipole flux through a coaxial loop | dΦ/dx vs finite difference; EMF peak at x = a/2; ∫ε dt = 0 over a pass |
| DC circuits | Modified nodal analysis; backward Euler for RC | Series/parallel formulas; Kirchhoff residuals ~1e-17; power balance; balanced bridge; first-order convergence |
| Gas kinetics | Time-stepped hard-disk MD with cell lists | Energy to 1e-12; Maxwell–Boltzmann mean speed (2 %); pressure vs Henderson EOS (3 %, statistical) |
| Heat conduction | FTCS | Exact discrete mode decay (1e-12); continuum within O(Δx²); steady state; unstable above r = ½ |

Two lessons from building them, recorded because they are easy to get wrong:

- **Leapfrog/Boris velocities sit half a step from positions.** Starting a
  Boris orbit with v(0) shifts the circle's centre by about r·ωΔt/2; the
  radius is still right. Measure from the orbit, not an assumed centre.
- **Sharp starts ring on a grid.** A piston switched on abruptly makes a kink
  that a finite-difference grid cannot represent; numerical dispersion turns
  it into high-frequency ripples that corrupted the measured wavelength by
  16 %. The sound lab ramps the piston smoothly over three cycles.
