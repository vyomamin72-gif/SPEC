"""Golden fixtures: reference trajectories written as JSON for the frontend tests.

Regenerate with:  uv run python scripts/generate_fixtures.py
tests/test_reference.py fails if the committed files are stale.
"""

import math
from pathlib import Path
from typing import Any

import numpy as np

from app.physics.reference import (
    GENERATOR,
    PendulumParams,
    ProjectileParams,
    solve_pendulum,
    solve_projectile,
)

FIXTURE_DIR = Path(__file__).resolve().parents[3] / "frontend" / "src" / "physics" / "__fixtures__"


def pendulum_fixture() -> dict[str, Any]:
    params = PendulumParams(length=1.0, gravity=9.80665, damping_rate=0.2)
    theta0, omega0 = 2.5, 0.0
    times = np.arange(101, dtype=np.float64) * 0.1  # 0 … 10 s
    states = solve_pendulum(params, theta0, omega0, times)
    return {
        "name": "pendulum-damped-large-amplitude",
        "description": "Nonlinear damped pendulum, θ'' = −(g/L) sin θ − γθ', released from 2.5 rad.",
        "generator": GENERATOR,
        "parameters": {
            "length": params.length,
            "gravity": params.gravity,
            "dampingRate": params.damping_rate,
            "theta0": theta0,
            "omega0": omega0,
        },
        "stateLabels": ["theta", "omega"],
        "times": times.tolist(),
        "states": states.tolist(),
    }


def projectile_fixture() -> dict[str, Any]:
    # A baseball-sized sphere. C_d = 0.47 is the textbook smooth-sphere value,
    # used here as a fixed model input, not a claim about real baseballs.
    radius = 0.0366
    params = ProjectileParams(
        mass=0.145,
        gravity=9.80665,
        drag_coefficient=0.47,
        cross_section_area=math.pi * radius**2,
        air_density=1.225,
    )
    speed, angle_deg = 40.0, 40.0
    solution = solve_projectile(params, speed, math.radians(angle_deg), sample_interval=0.05)
    return {
        "name": "projectile-quadratic-drag",
        "description": "Projectile with quadratic drag from ground level until it lands.",
        "generator": GENERATOR,
        "parameters": {
            "mass": params.mass,
            "gravity": params.gravity,
            "dragCoefficient": params.drag_coefficient,
            "crossSectionArea": params.cross_section_area,
            "airDensity": params.air_density,
            "speed": speed,
            "angleDeg": angle_deg,
        },
        "stateLabels": ["x", "y", "vx", "vy"],
        "times": solution.times.tolist(),
        "states": solution.states.tolist(),
        "landingTime": solution.landing_time,
        "landingState": solution.landing_state.tolist(),
    }


def build_fixtures() -> dict[str, dict[str, Any]]:
    return {f["name"]: f for f in (pendulum_fixture(), projectile_fixture())}
