"""Request and response schemas for saved experiments."""

import json
import math
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.config import Settings

ExperimentType = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=64)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]

_MAX_PARAMETERS_BYTES = Settings().max_parameters_bytes


def _reject_non_finite(value: Any, path: str = "parameters") -> None:
    """NaN and ±Infinity are not valid JSON and PostgreSQL's JSON type rejects them."""
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{path} contains a non-finite number ({value}); only finite numbers are allowed")
    if isinstance(value, dict):
        for key, item in value.items():
            _reject_non_finite(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_non_finite(item, f"{path}[{index}]")


def _validate_parameters(parameters: dict[str, Any]) -> dict[str, Any]:
    _reject_non_finite(parameters)
    size = len(json.dumps(parameters, separators=(",", ":")).encode())
    if size > _MAX_PARAMETERS_BYTES:
        raise ValueError(f"parameters are {size} bytes; the limit is {_MAX_PARAMETERS_BYTES}")
    return parameters


class SavedExperimentCreate(BaseModel):
    name: Name
    description: Description | None = None
    experiment_type: ExperimentType
    schema_version: int = Field(ge=1)
    parameters: dict[str, Any]

    _check_parameters = field_validator("parameters")(_validate_parameters)


class SavedExperimentUpdate(BaseModel):
    """Partial update. Fields that are omitted are left unchanged."""

    name: Name | None = None
    description: Description | None = None
    schema_version: int | None = Field(default=None, ge=1)
    parameters: dict[str, Any] | None = None

    @field_validator("parameters")
    @classmethod
    def _check_parameters(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return None if value is None else _validate_parameters(value)

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> "SavedExperimentUpdate":
        # Only `description` may be cleared. An explicit null elsewhere is a
        # client error, reported rather than silently ignored.
        for field in ("name", "schema_version", "parameters"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SavedExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    experiment_type: str
    schema_version: int
    parameters: dict[str, Any]
    created_at: datetime
    updated_at: datetime
