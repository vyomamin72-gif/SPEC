"""Validate the SciPy reference solvers against analytic solutions.

Tolerance rationale: rtol = atol = 1e-12 per step; accumulated over these
runs the global error stays below ~1e-10, so 1e-9 leaves margin while still
being far tighter than anything the TypeScript tests rely on.
"""

import json
import math

import numpy as np
import pytest

from app.physics.fixtures import FIXTURE_DIR, build_fixtures
from app.physics.reference import (
    PendulumParams,
    ProjectileParams,
    measure_pendulum_period,
    pendulum_period_exact,
    solve_pendulum,
    solve_projectile,
)

G = 9.80665


def test_linear_pendulum_matches_damped_harmonic_solution() -> None:
    p = PendulumParams(length=2.0, gravity=G, damping_rate=0.3, linear=True)
    theta0 = 0.4
    w0 = math.sqrt(G / p.length)
    wd = math.sqrt(w0**2 - p.damping_rate**2 / 4)
    t = np.linspace(0, 20, 201)
    decay = np.exp(-p.damping_rate * t / 2)
    exact = theta0 * decay * (np.cos(wd * t) + p.damping_rate / (2 * wd) * np.sin(wd * t))
    assert np.max(np.abs(solve_pendulum(p, theta0, 0.0, t)[:, 0] - exact)) < 1e-9


@pytest.mark.parametrize("theta0", [0.05, 1.0, 2.5, 3.0])
def test_nonlinear_period_matches_elliptic_integral(theta0: float) -> None:
    p = PendulumParams(length=1.0, gravity=G)
    exact = pendulum_period_exact(p.length, p.gravity, theta0)
    assert measure_pendulum_period(p, theta0) == pytest.approx(exact, rel=1e-9)


def test_small_angle_period_limit() -> None:
    # Model error of T₀ = 2π√(L/g) at amplitude θ₀ is ≈ θ₀²/16 (series expansion).
    theta0 = 0.05
    exact = pendulum_period_exact(1.0, G, theta0)
    t0 = 2 * math.pi * math.sqrt(1.0 / G)
    assert exact / t0 - 1 == pytest.approx(theta0**2 / 16 + 11 * theta0**4 / 3072, rel=1e-4)


def test_vertical_fall_with_quadratic_drag_matches_tanh_solution() -> None:
    p = ProjectileParams(
        mass=0.5, gravity=G, drag_coefficient=0.5, cross_section_area=0.01, air_density=1.225
    )
    sol = solve_projectile(p, speed=0.0, angle_rad=0.0, sample_interval=0.1, height=500.0)
    vt = p.terminal_speed
    exact_vy = -vt * np.tanh(G * sol.times / vt)
    assert np.max(np.abs(sol.states[:, 3] - exact_vy)) < 1e-9


def test_drag_free_projectile_matches_closed_form() -> None:
    p = ProjectileParams(mass=1.0, gravity=G, drag_coefficient=0.0, cross_section_area=0.0, air_density=0.0)
    v0, angle = 25.0, math.radians(35)
    sol = solve_projectile(p, v0, angle, sample_interval=0.1)
    assert sol.landing_time == pytest.approx(2 * v0 * math.sin(angle) / G, rel=1e-10)
    assert sol.landing_state[0] == pytest.approx(v0**2 * math.sin(2 * angle) / G, rel=1e-10)


def test_committed_fixtures_are_up_to_date() -> None:
    """Fails if the fixture generator changed but the JSON files were not regenerated."""
    for name, expected in build_fixtures().items():
        path = FIXTURE_DIR / f"{name}.json"
        assert path.exists(), f"missing {path}; run scripts/generate_fixtures.py"
        committed = json.loads(path.read_text())
        assert committed["parameters"] == expected["parameters"]
        # Small slack: other SciPy/NumPy builds may differ in the last bits.
        np.testing.assert_allclose(committed["states"], expected["states"], rtol=1e-10, atol=1e-12)
