"""Application settings, read from environment variables prefixed PHYSICS_LAB_."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PHYSICS_LAB_")

    # SQLite by default. Any SQLAlchemy URL works, e.g.
    # postgresql+psycopg://user:password@host/dbname (requires installing a driver).
    database_url: str = "sqlite:///./physics_lab.db"

    # Upper bound on the serialised size of a saved experiment's parameters.
    # Parameters are initial conditions and settings, not recorded data.
    max_parameters_bytes: int = 64_000
