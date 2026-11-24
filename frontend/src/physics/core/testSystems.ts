import type { MechanicalSystem } from './integrators'

/*
 * Small reference systems shared by tests (and later by experiments).
 * All SI units.
 */

/** q'' = −ω² q. */
export function harmonicOscillator(omega: number): MechanicalSystem {
  return {
    dof: 1,
    acceleration(_t, q, _v, a) {
      a[0] = -omega * omega * q[0]
    },
  }
}

/** q'' = −(g/L) sin q − γ q'. */
export function dampedPendulum(length: number, gravity: number, dampingRate: number): MechanicalSystem {
  return {
    dof: 1,
    acceleration(_t, q, v, a) {
      a[0] = -(gravity / length) * Math.sin(q[0]) - dampingRate * v[0]
    },
  }
}

/** 2D point mass in uniform gravity with quadratic drag; q = (x, y). dragFactor k = ½ρC_dA. */
export function projectileWithDrag(mass: number, gravity: number, dragFactor: number): MechanicalSystem {
  const c = dragFactor / mass
  return {
    dof: 2,
    acceleration(_t, _q, v, a) {
      const speed = Math.hypot(v[0], v[1])
      a[0] = -c * speed * v[0]
      a[1] = -gravity - c * speed * v[1]
    },
  }
}
