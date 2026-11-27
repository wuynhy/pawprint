from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Pet, Report, User
from ..photos import PETS, delete_photo, photo_response, save_photo

router = APIRouter(prefix="/pets", tags=["pets"])


def owned_pet(pet_id: int, user: User, db: Session) -> Pet:
    pet = db.get(Pet, pet_id)
    # 404 rather than 403 so other users' pet ids aren't revealed.
    if pet is None or pet.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pet not found")
    return pet


def _pet_out(pet: Pet) -> schemas.PetOut:
    out = schemas.PetOut.model_validate(pet)
    if pet.reports:
        out.latest_report = schemas.ReportOut.model_validate(pet.reports[0])
    return out


@router.get("", response_model=List[schemas.PetOut])
def list_pets(user: User = Depends(get_current_user)):
    return [_pet_out(p) for p in sorted(user.pets, key=lambda p: p.created_at, reverse=True)]


@router.post("", response_model=schemas.PetOut, status_code=status.HTTP_201_CREATED)
def create_pet(
    body: schemas.PetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    pet = Pet(owner_id=user.id, **body.model_dump())
    db.add(pet)
    db.commit()
    return _pet_out(pet)


@router.get("/{pet_id}", response_model=schemas.PetOut)
def get_pet(pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _pet_out(owned_pet(pet_id, user, db))


@router.patch("/{pet_id}", response_model=schemas.PetOut)
def update_pet(
    pet_id: int,
    body: schemas.PetUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change a pet's name and/or age. Only the fields sent are changed."""
    pet = owned_pet(pet_id, user, db)
    if "name" in body.model_fields_set:
        if body.name is None or not body.name.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name can't be empty")
        pet.name = body.name.strip()
    if "age_years" in body.model_fields_set:
        pet.age_years = body.age_years
    db.commit()
    return _pet_out(pet)


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(owned_pet(pet_id, user, db))
    db.commit()


@router.put("/{pet_id}/photo", response_model=schemas.PetOut)
async def upload_photo(
    pet_id: int,
    photo: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pet = owned_pet(pet_id, user, db)
    filename = await save_photo(photo, PETS)
    old = pet.photo_filename
    pet.photo_filename = filename
    db.commit()
    delete_photo(PETS, old)
    return _pet_out(pet)


@router.get("/{pet_id}/photo")
def get_photo(pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return photo_response(PETS, owned_pet(pet_id, user, db).photo_filename)


@router.delete("/{pet_id}/photo", response_model=schemas.PetOut)
def remove_photo(pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pet = owned_pet(pet_id, user, db)
    old = pet.photo_filename
    pet.photo_filename = None
    db.commit()
    delete_photo(PETS, old)
    return _pet_out(pet)


@router.get("/{pet_id}/reports", response_model=List[schemas.ReportOut])
def list_reports(
    pet_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return owned_pet(pet_id, user, db).reports


def _owned_report(pet_id: int, report_id: int, user: User, db: Session) -> Report:
    owned_pet(pet_id, user, db)
    report = db.get(Report, report_id)
    if report is None or report.pet_id != pet_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report


@router.get("/{pet_id}/reports/{report_id}", response_model=schemas.ReportOut)
def get_report(
    pet_id: int,
    report_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _owned_report(pet_id, report_id, user, db)


@router.delete("/{pet_id}/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    pet_id: int,
    report_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(_owned_report(pet_id, report_id, user, db))
    db.commit()
