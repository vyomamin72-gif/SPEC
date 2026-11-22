"""FastAPI application factory.

Run in development with:  uv run uvicorn app.main:app --reload
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import __version__
from app.api import experiments, health
from app.config import Settings
from app.db import Base, build_engine, build_session_factory


async def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return validation errors without echoing the rejected input.

    FastAPI's default handler includes the offending input in the response.
    When that input contains NaN or Infinity (which we reject), serialising
    the echo fails and turns a 422 into a 500. Reporting only the location and
    message avoids that and also avoids reflecting arbitrary client data.
    """
    assert isinstance(exc, RequestValidationError)
    errors = [
        {"type": error["type"], "loc": list(error["loc"]), "msg": error["msg"]} for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = build_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Development convenience. create_all only creates missing tables; it
        # cannot alter existing ones. Introduce Alembic migrations before the
        # first schema change once real user data exists (docs/ARCHITECTURE.md §6).
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="Physics Laboratory API", version=__version__, lifespan=lifespan)
    app.state.session_factory = build_session_factory(engine)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(health.router, prefix="/api")
    app.include_router(experiments.router, prefix="/api")
    return app


app = create_app()
