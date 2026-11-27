from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..db import get_db
from ..models import Breed

router = APIRouter(prefix="/breeds", tags=["breeds"])


@router.get("", response_model=List[schemas.BreedOut])
def list_breeds(species: schemas.Species, db: Session = Depends(get_db)):
    return db.scalars(select(Breed).where(Breed.species == species).order_by(Breed.name)).all()
