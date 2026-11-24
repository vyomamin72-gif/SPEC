# Physics Laboratory — backend

FastAPI service for persistence (saved experiments) and, from Phase 2, SciPy
reference computations. See `../docs/ARCHITECTURE.md` §6.

```bash
uv sync                                   # install
uv run uvicorn app.main:app --reload      # serve on http://127.0.0.1:8000 (docs at /docs)
uv run pytest                             # tests
uv run ruff check . && uv run mypy app tests
```
