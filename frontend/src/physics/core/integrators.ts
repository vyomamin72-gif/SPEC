/**
 * Numerical integrators for mechanical systems.
 *
 * A mechanical system with n degrees of freedom stores its state in one
 * Float64Array laid out as [q₀ … qₙ₋₁, v₀ … vₙ₋₁] (positions, then velocities),
 * in SI units. Steppers advance that array in place, so no memory is allocated
 * per step. See docs/NUMERICAL_METHODS.md §1 for when to use which method.
 */

export type IntegratorName = 'euler' | 'semi-implicit-euler' | 'velocity-verlet' | 'rk4'

export interface MechanicalSystem {
  /** Number of degrees of freedom n. */
  readonly dof: number
  /** Write the accelerations d²q/dt² into `out`. Must not modify q or v. */
  acceleration(t: number, q: Float64Array, v: Float64Array, out: Float64Array): void
}

export interface Stepper {
  readonly name: IntegratorName
  /** Advance `state` ([q | v]) from time t to t + dt, in place. */
  step(t: number, state: Float64Array, dt: number): void
}

export const INTEGRATOR_INFO: Record<IntegratorName, { label: string; order: number; symplectic: boolean; note: string }> = {
  euler: {
    label: 'Explicit Euler',
    order: 1,
    symplectic: false,
    note: 'Teaching only. Energy of oscillators grows every step.',
  },
  'semi-implicit-euler': {
    label: 'Semi-implicit Euler',
    order: 1,
    symplectic: true,
    note: 'Cheap; energy error stays bounded instead of drifting.',
  },
  'velocity-verlet': {
    label: 'Velocity Verlet',
    order: 2,
    symplectic: true,
    note: 'Bounded energy error over very long runs. Symplectic only for velocity-independent forces.',
  },
  rk4: {
    label: 'Runge–Kutta 4',
    order: 4,
    symplectic: false,
    note: 'Very accurate per step; energy can drift slowly over very long runs.',
  },
}

/** dy/dt = f(t, y) for a general first-order system; writes into dydt. */
export type Derivative = (t: number, y: Float64Array, dydt: Float64Array) => void

/**
 * Classical fourth-order Runge–Kutta for any first-order system.
 * Returns a function that advances y from t to t + dt in place.
 */
export function createRk4(dimension: number, derivative: Derivative): (t: number, y: Float64Array, dt: number) => void {
  const k1 = new Float64Array(dimension)
  const k2 = new Float64Array(dimension)
  const k3 = new Float64Array(dimension)
  const k4 = new Float64Array(dimension)
  const tmp = new Float64Array(dimension)
  return (t, y, dt) => {
    const half = dt / 2
    derivative(t, y, k1)
    for (let i = 0; i < dimension; i++) tmp[i] = y[i] + half * k1[i]
    derivative(t + half, tmp, k2)
    for (let i = 0; i < dimension; i++) tmp[i] = y[i] + half * k2[i]
    derivative(t + half, tmp, k3)
    for (let i = 0; i < dimension; i++) tmp[i] = y[i] + dt * k3[i]
    derivative(t + dt, tmp, k4)
    for (let i = 0; i < dimension; i++) y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  }
}

/** Position/velocity views into a state array, recreated only when the array changes. */
function createViewCache(n: number) {
  const views: { q: Float64Array<ArrayBufferLike>; v: Float64Array<ArrayBufferLike> } = {
    q: new Float64Array(0),
    v: new Float64Array(0),
  }
  let last: Float64Array | null = null
  return (state: Float64Array) => {
    if (state !== last) {
      if (state.length !== 2 * n) throw new RangeError(`State length ${state.length} does not match 2 × dof = ${2 * n}`)
      views.q = state.subarray(0, n)
      views.v = state.subarray(n, 2 * n)
      last = state
    }
    return views
  }
}

export function createStepper(name: IntegratorName, system: MechanicalSystem): Stepper {
  const n = system.dof
  const getViews = createViewCache(n)

  switch (name) {
    case 'euler': {
      const a = new Float64Array(n)
      return {
        name,
        step(t, state, dt) {
          const { q, v } = getViews(state)
          system.acceleration(t, q, v, a)
          for (let i = 0; i < n; i++) {
            q[i] += v[i] * dt // uses the old velocity
            v[i] += a[i] * dt
          }
        },
      }
    }
    case 'semi-implicit-euler': {
      const a = new Float64Array(n)
      return {
        name,
        step(t, state, dt) {
          const { q, v } = getViews(state)
          system.acceleration(t, q, v, a)
          for (let i = 0; i < n; i++) {
            v[i] += a[i] * dt
            q[i] += v[i] * dt // uses the new velocity
          }
        },
      }
    }
    case 'velocity-verlet': {
      const a0 = new Float64Array(n)
      const a1 = new Float64Array(n)
      const vPredicted = new Float64Array(n)
      return {
        name,
        step(t, state, dt) {
          const { q, v } = getViews(state)
          system.acceleration(t, q, v, a0)
          for (let i = 0; i < n; i++) {
            q[i] += v[i] * dt + 0.5 * a0[i] * dt * dt
            // Only used if the force depends on velocity (e.g. damping);
            // the scheme is then second order but no longer symplectic.
            vPredicted[i] = v[i] + a0[i] * dt
          }
          system.acceleration(t + dt, q, vPredicted, a1)
          for (let i = 0; i < n; i++) v[i] += 0.5 * (a0[i] + a1[i]) * dt
        },
      }
    }
    case 'rk4': {
      const qs = new Float64Array(n)
      const vs = new Float64Array(n)
      const as = new Float64Array(n)
      const rk4 = createRk4(2 * n, (t, y, dydt) => {
        for (let i = 0; i < n; i++) {
          qs[i] = y[i]
          vs[i] = y[n + i]
        }
        system.acceleration(t, qs, vs, as)
        for (let i = 0; i < n; i++) {
          dydt[i] = vs[i]
          dydt[n + i] = as[i]
        }
      })
      return {
        name,
        step(t, state, dt) {
          getViews(state) // validates length
          rk4(t, state, dt)
        },
      }
    }
  }
}
