"""Database operations for saved experiments."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utc_now
from app.models import SavedExperiment
from app.schemas.experiment import SavedExperimentCreate, SavedExperimentUpdate


def create_experiment(session: Session, data: SavedExperimentCreate) -> SavedExperiment:
    now = utc_now()  # one timestamp, so created_at == updated_at on creation
    experiment = SavedExperiment(**data.model_dump(), created_at=now, updated_at=now)
    session.add(experiment)
    session.commit()
    session.refresh(experiment)
    return experiment


def get_experiment(session: Session, experiment_id: int) -> SavedExperiment | None:
    return session.get(SavedExperiment, experiment_id)


def list_experiments(
    session: Session, experiment_type: str | None = None, limit: int = 50, offset: int = 0
) -> Sequence[SavedExperiment]:
    query = select(SavedExperiment)
    if experiment_type is not None:
        query = query.where(SavedExperiment.experiment_type == experiment_type)
    query = query.order_by(SavedExperiment.updated_at.desc(), SavedExperiment.id.desc())
    return session.scalars(query.limit(limit).offset(offset)).all()


def update_experiment(
    session: Session, experiment: SavedExperiment, changes: SavedExperimentUpdate
) -> SavedExperiment:
    # Only fields present in the request are applied; the schema has already
    # rejected explicit nulls for fields that cannot be cleared.
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(experiment, field, value)
    experiment.updated_at = utc_now()
    session.commit()
    session.refresh(experiment)
    return experiment


def delete_experiment(session: Session, experiment: SavedExperiment) -> None:
    session.delete(experiment)
    session.commit()
