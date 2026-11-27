"""Care log: checkups, vaccinations and other care entries for a pet."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import CareEvent, User
from .pets import owned_pet

router = APIRouter(prefix="/pets/{pet_id}/care", tags=["care log"])


def _owned_event(pet_id: int, event_id: int, user: User, db: Session) -> CareEvent:
    owned_pet(pet_id, user, db)
    event = db.get(CareEvent, event_id)
    if event is None or event.pet_id != pet_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Care entry not found")
    return event


@router.get("", response_model=List[schemas.CareEventOut])
def list_care(pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Newest date first."""
    return owned_pet(pet_id, user, db).care_events


@router.post("", response_model=schemas.CareEventOut, status_code=status.HTTP_201_CREATED)
def add_care(
    pet_id: int,
    body: schemas.CareEventIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_pet(pet_id, user, db)
    event = CareEvent(pet_id=pet_id, **body.model_dump())
    db.add(event)
    db.commit()
    return event


@router.put("/{event_id}", response_model=schemas.CareEventOut)
def update_care(
    pet_id: int,
    event_id: int,
    body: schemas.CareEventIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _owned_event(pet_id, event_id, user, db)
    for field, value in body.model_dump().items():
        setattr(event, field, value)
    db.commit()
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_care(
    pet_id: int,
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(_owned_event(pet_id, event_id, user, db))
    db.commit()
