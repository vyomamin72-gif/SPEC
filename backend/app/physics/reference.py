"""Reference solvers built on scipy.integrate.solve_ivp (DOP853, 8th order).

All quantities are SI. Tolerances rtol = atol = 1e-12 put the reference error
around 1e-11 or below for the problems here, well under the errors of the
TypeScript integrators it is used to check (~1e-9 and above).
"""

import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.integrate import solve_ivp
from scipy.special import ellipk

RTOL = 1e-12
ATOL = 1e-12
METHOD = "DOP853"
GENERATOR = f"scipy.integrate.solve_ivp method={METHOD} rtol={RTOL} atol={ATOL}"

FloatArray = NDArray[np.float64]
Rhs = Callable[[float, FloatArray], FloatArray]


# ── Pendulum ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PendulumParams:
    """Point mass on a massless rigid rod: θ'' = −(g/L)·sin θ − γ·θ'.

    `linear=True` replaces sin θ by θ (small-angle model).
    """

    length: float
    gravity: float
    damping_rate: float = 0.0
    linear: bool = False


def pendulum_rhs(p: PendulumParams) -> Rhs:
    def rhs(_t: float, y: FloatArray) -> FloatArray:
        theta, omega = y
        restoring = theta if p.linear else math.sin(theta)
        return np.array([omega, -(p.gravity / p.length) * restoring - p.damping_rate * omega])

    return rhs


def solve_pendulum(p: PendulumParams, theta0: float, omega0: float, t_eval: FloatArray) -> FloatArray:
    """States [θ, ω] at each time in t_eval; shape (len(t_eval), 2)."""
    sol = solve_ivp(
        pendulum_rhs(p), (0.0, float(t_eval[-1])), [theta0, omega0],
        method=METHOD, rtol=RTOL, atol=ATOL, t_eval=t_eval,
    )  # fmt: skip
    if not sol.success:
        raise RuntimeError(sol.message)
    return np.asarray(sol.y.T, dtype=np.float64)


def pendulum_period_exact(length: float, gravity: float, theta0: float) -> float:
    """Exact undamped period T = 4√(L/g)·K(k), k = sin(θ₀/2). SciPy's ellipk takes m = k²."""
    return float(4.0 * math.sqrt(length / gravity) * ellipk(math.sin(abs(theta0) / 2.0) ** 2))


def measure_pendulum_period(p: PendulumParams, theta0: float, periods: int = 3) -> float:
    """Average time between successive upward zero crossings of θ, located by SciPy events."""

    def upward_crossing(_t: float, y: FloatArray) -> float:
        return float(y[0])

    upward_crossing.direction = 1.0  # type: ignore[attr-defined]
    t_end = (periods + 1.5) * pendulum_period_exact(p.length, p.gravity, theta0)
    sol = solve_ivp(
        pendulum_rhs(p), (0.0, t_end), [theta0, 0.0],
        method=METHOD, rtol=RTOL, atol=ATOL, events=upward_crossing,
    )  # fmt: skip
    crossings = sol.t_events[0]
    if len(crossings) < periods + 1:
        raise RuntimeError("not enough zero crossings to measure the period")
    return float(np.mean(np.diff(crossings[: periods + 1])))


# ── Projectile with quadratic drag ──────────────────────────────────────────


@dataclass(frozen=True)
class ProjectileParams:
    """Point mass in uniform gravity with quadratic drag F = −½ρC_dA|v|v."""

    mass: float
    gravity: float
    drag_coefficient: float
    cross_section_area: float
    air_density: float

    @property
    def drag_factor(self) -> float:
        """k = ½ρC_dA, so the drag acceleration is −(k/m)|v|v."""
        return 0.5 * self.air_density * self.drag_coefficient * self.cross_section_area

    @property
    def terminal_speed(self) -> float:
        return math.sqrt(self.mass * self.gravity / self.drag_factor)


def projectile_rhs(p: ProjectileParams) -> Rhs:
    c = p.drag_factor / p.mass

    def rhs(_t: float, y: FloatArray) -> FloatArray:
        _x, _y, vx, vy = y
        speed = math.hypot(vx, vy)
        return np.array([vx, vy, -c * speed * vx, -p.gravity - c * speed * vy])

    return rhs


@dataclass(frozen=True)
class ProjectileSolution:
    times: FloatArray
    states: FloatArray  # shape (n, 4): x, y, vx, vy
    landing_time: float
    landing_state: FloatArray


def solve_projectile(
    p: ProjectileParams, speed: float, angle_rad: float, sample_interval: float, height: float = 0.0
) -> ProjectileSolution:
    """Integrate until the body returns to y = 0 (descending); sample at a fixed interval."""

    def landing(_t: float, y: FloatArray) -> float:
        return float(y[1])

    landing.terminal = True  # type: ignore[attr-defined]
    landing.direction = -1.0  # type: ignore[attr-defined]
    y0 = [0.0, height, speed * math.cos(angle_rad), speed * math.sin(angle_rad)]
    sol = solve_ivp(
        projectile_rhs(p), (0.0, 1e4), y0,
        method=METHOD, rtol=RTOL, atol=ATOL, events=landing, dense_output=True,
    )  # fmt: skip
    if sol.status != 1:
        raise RuntimeError("projectile did not land")
    landing_time = float(sol.t_events[0][0])
    n = math.floor(landing_time / sample_interval + 1e-9) + 1
    times = np.arange(n, dtype=np.float64) * sample_interval
    return ProjectileSolution(
        times=times,
        states=np.asarray(sol.sol(times).T, dtype=np.float64),
        landing_time=landing_time,
        landing_state=np.asarray(sol.y_events[0][0], dtype=np.float64),
    )
