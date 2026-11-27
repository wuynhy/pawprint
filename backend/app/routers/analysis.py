from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Breed, Report, User
from ..photos import PETS, read_image, store_image
from ..services.breed_ai import AIUnavailableError, get_or_create_breed
from ..services.photo_breed import MAX_PHOTO_BYTES, MAX_PHOTOS, PhotoNotUsable, breakdown_from_photos
from ..services.timeline import build_timeline
from .pets import owned_pet

router = APIRouter(prefix="/pets/{pet_id}/analysis", tags=["analysis"])


@router.post("/manual", response_model=schemas.ReportOut, status_code=status.HTTP_201_CREATED)
def analyze_manual(
    pet_id: int,
    body: schemas.ManualAnalysisIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pet = owned_pet(pet_id, user, db)
    if body.breed_id is not None:
        breed = db.get(Breed, body.breed_id)
    else:
        try:
            breed = get_or_create_breed(db, pet.species, body.breed_name)
        except AIUnavailableError as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    if breed is None or breed.species != pet.species:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown {pet.species} breed")

    breakdown = [{"breed": breed.name, "percent": 100.0}]
    report = Report(
        pet_id=pet.id,
        input_method="manual",
        breed_breakdown=breakdown,
        biological_age=None,
        timeline=build_timeline(db, pet.species, breakdown),
    )
    db.add(report)
    db.commit()
    return report


@router.post("/photo", response_model=schemas.ReportOut, status_code=status.HTTP_201_CREATED)
async def analyze_photo(
    pet_id: int,
    photos: List[UploadFile] = File(...),
    known_breed: Optional[str] = Form(default=None, max_length=80),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Estimate the breed mix from 1-3 photos with Claude, then build the health timeline."""
    pet = owned_pet(pet_id, user, db)
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Upload at most {MAX_PHOTOS} photos")
    images = [await read_image(p, MAX_PHOTO_BYTES) for p in photos]
    known_breed = (known_breed or "").strip() or None

    def analyze():
        # Blocking Claude calls run in a worker thread so other requests aren't held up.
        breakdown = breakdown_from_photos(db, pet.species, images, known_breed)
        return breakdown, build_timeline(db, pet.species, breakdown)

    try:
        breakdown, timeline = await run_in_threadpool(analyze)
    except PhotoNotUsable as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
    except AIUnavailableError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    # The first photo becomes the profile picture if the pet doesn't have one yet.
    if not pet.photo_filename:
        pet.photo_filename = store_image(*images[0], PETS)

    report = Report(
        pet_id=pet.id,
        input_method="photo",
        breed_breakdown=breakdown,
        biological_age=None,
        timeline=timeline,
    )
    db.add(report)
    db.commit()
    return report
