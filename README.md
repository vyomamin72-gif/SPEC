# Physics Laboratory

An interactive physics simulation platform. Every simulation will be driven by
numerical integration of its equations of motion, not by animation formulas,
and every result is compared against theory where theory exists.

> **Status: Phase 2 (physics engine) complete. No experiment is runnable in the UI yet.**
> The tested engine (integrators, fixed-step loop, event location, data
> recording, SciPy reference fixtures) exists; the first experiments that use
> it are Phase 3.
> See [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, simulation loop, separation of concerns, backend role |
| [docs/NUMERICAL_METHODS.md](docs/NUMERICAL_METHODS.md) | Integrator choice per experiment, analytic references, tolerance policy |
| [docs/ROADMAP.md](docs/ROADMAP.md) | MVP definition, phases, risk register |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, components, measured contrast, accessibility rules |

## Stack

- **Frontend:** React 19, TypeScript 5.9 (strict), Vite 8, Tailwind CSS 4,
  React Router, react-resizable-panels. Planned: Zustand, uPlot, Three.js —
  each added in the phase that first uses it.
- **Backend:** Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic 2, SQLite
  (portable to PostgreSQL), NumPy and SciPy for reference solutions.
- **Tests:** Vitest + Testing Library, Pytest, Playwright.

## Prerequisites

- Node.js 22+ and pnpm 10+
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)

## Install and run

```bash
# Backend (optional: only needed for saving experiments)
cd backend
uv sync
uv run uvicorn app.main:app --reload        # http://127.0.0.1:8000, API docs at /docs

# Frontend (in a second terminal)
cd frontend
pnpm install
pnpm dev                                    # http://127.0.0.1:5173
```

The frontend proxies `/api` to the backend. Without the backend, the app still
works; the header shows "Storage server offline".

Configuration (environment variables):

| Variable | Default | Purpose |
|---|---|---|
| `PHYSICS_LAB_DATABASE_URL` | `sqlite:///./physics_lab.db` | SQLAlchemy database URL |
| `PHYSICS_LAB_MAX_PARAMETERS_BYTES` | `64000` | Size limit for saved parameters |
| `PHYSICS_LAB_BACKEND_URL` | `http://127.0.0.1:8000` | Where the Vite dev/preview proxy sends `/api` |

## Tests and checks

```bash
cd frontend
pnpm lint && pnpm typecheck && pnpm test    # ESLint, tsc, Vitest
pnpm e2e                                    # Playwright on the production build (desktop + mobile)

cd backend
uv run ruff check . && uv run mypy app tests && uv run pytest
```

Regenerate the SciPy golden fixtures after changing a reference problem:

```bash
cd backend && uv run python scripts/generate_fixtures.py
```

The same checks run in GitHub Actions (`.github/workflows/ci.yml`).

## API (Phase 1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service and database health |
| POST | `/api/experiments` | Save an experiment configuration |
| GET | `/api/experiments?experiment_type=&limit=&offset=` | List, newest first |
| GET | `/api/experiments/{id}` | Fetch one |
| PATCH | `/api/experiments/{id}` | Partial update |
| DELETE | `/api/experiments/{id}` | Delete |

## Known limitations (current)

- No experiment UI yet. Every experiment is labelled "Planned".
- Tables are created with `create_all`. Alembic migrations must be added
  before the first schema change once real data exists.
- There is no authentication. Do not expose the backend publicly.
- Dark theme only, by design.
