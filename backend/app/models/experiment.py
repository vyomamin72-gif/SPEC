"""ORM model for a saved experiment configuration."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utc_now


class SavedExperiment(Base):
    """A named set of parameters for one experiment type.

    `parameters` is stored as JSON. Its structure is owned by the frontend
    simulation identified by `experiment_type`, and `schema_version` lets the
    frontend migrate configurations saved by older versions.
    """

    __tablename__ = "saved_experiments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(2000), default=None)
    experiment_type: Mapped[str] = mapped_column(String(64), index=True)
    schema_version: Mapped[int] = mapped_column(Integer)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, index=True)
