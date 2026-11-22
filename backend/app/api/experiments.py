from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import SavedExperiment
from app.schemas.experiment import SavedExperimentCreate, SavedExperimentRead, SavedExperimentUpdate
from app.services import experiments as service

router = APIRouter(prefix="/experiments", tags=["experiments"])

SessionDep = Annotated[Session, Depends(get_session)]


def _get_or_404(session: Session, experiment_id: int) -> SavedExperiment:
    experiment = service.get_experiment(session, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail=f"Saved experiment {experiment_id} not found")
    return experiment


@router.post("", status_code=status.HTTP_201_CREATED)
def create(data: SavedExperimentCreate, session: SessionDep) -> SavedExperimentRead:
    return SavedExperimentRead.model_validate(service.create_experiment(session, data))


@router.get("")
def list_all(
    session: SessionDep,
    experiment_type: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[SavedExperimentRead]:
    rows = service.list_experiments(session, experiment_type, limit, offset)
    return [SavedExperimentRead.model_validate(row) for row in rows]


@router.get("/{experiment_id}")
def read(experiment_id: int, session: SessionDep) -> SavedExperimentRead:
    return SavedExperimentRead.model_validate(_get_or_404(session, experiment_id))


@router.patch("/{experiment_id}")
def update(experiment_id: int, changes: SavedExperimentUpdate, session: SessionDep) -> SavedExperimentRead:
    experiment = _get_or_404(session, experiment_id)
    return SavedExperimentRead.model_validate(service.update_experiment(session, experiment, changes))


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(experiment_id: int, session: SessionDep) -> Response:
    service.delete_experiment(session, _get_or_404(session, experiment_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
