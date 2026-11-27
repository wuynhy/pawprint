import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Breed, BreedRisk

BREEDS_FILE = Path(__file__).parent / "data" / "breeds.json"


def seed_breeds(db: Session) -> None:
    """Load breed reference data on first run. Delete the breeds table rows to reseed."""
    if db.scalar(select(func.count()).select_from(Breed)):
        return
    for entry in json.loads(BREEDS_FILE.read_text()):
        breed = Breed(species=entry["species"], name=entry["name"], traits=entry["traits"])
        breed.risks = [BreedRisk(**risk) for risk in entry["risks"]]
        db.add(breed)
    db.commit()
