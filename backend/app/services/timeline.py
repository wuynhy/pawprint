"""Health Timeline Generator: turns a breed breakdown into a life-stage health risk timeline.

Both input paths (manual entry and photo analysis) produce a breed breakdown, and both end here.
"""

from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Breed
from .breed_ai import AIUnavailableError, get_or_create_breed

# Breeds below this share of the breakdown contribute too little to report their risks.
MIN_PERCENT = 10.0

_SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2}


def life_stage(onset_years: float) -> str:
    if onset_years < 1:
        return "young"
    if onset_years < 7:
        return "adult"
    return "senior"


def build_timeline(db: Session, species: str, breakdown: List[dict]) -> List[dict]:
    names = [b["breed"] for b in breakdown if b["percent"] >= MIN_PERCENT]
    breeds = list(
        db.scalars(
            select(Breed)
            .where(Breed.species == species, Breed.name.in_(names))
            .options(selectinload(Breed.risks))
        ).all()
    )

    # Breeds we don't have yet are generated with AI and saved for next time.
    found = {b.name.lower() for b in breeds}
    for name in names:
        if name.lower() in found:
            continue
        try:
            breed = get_or_create_breed(db, species, name)
        except AIUnavailableError:
            continue  # already logged; build the timeline from the breeds we have
        if breed is not None and breed.name.lower() not in found:
            breeds.append(breed)
            found.add(breed.name.lower())

    # The same condition can come from several breeds in a mix; report it once.
    merged: Dict[str, dict] = {}
    for breed in breeds:
        for risk in breed.risks:
            item = merged.get(risk.condition)
            if item is None:
                merged[risk.condition] = {
                    "condition": risk.condition,
                    "description": risk.description,
                    "symptoms": list(risk.symptoms),
                    "prevention": list(risk.prevention),
                    "severity": risk.severity,
                    "onset_min_years": risk.onset_min_years,
                    "onset_max_years": risk.onset_max_years,
                    "from_breeds": [breed.name],
                    "ai_generated": breed.source == "ai",
                }
                continue
            item["from_breeds"].append(breed.name)
            # Curated data from any breed in the mix backs this condition.
            item["ai_generated"] = item["ai_generated"] and breed.source == "ai"
            if _SEVERITY_RANK[risk.severity] > _SEVERITY_RANK[item["severity"]]:
                item["severity"] = risk.severity
            item["onset_min_years"] = min(item["onset_min_years"], risk.onset_min_years)

    timeline = list(merged.values())
    for item in timeline:
        item["life_stage"] = life_stage(item["onset_min_years"])
    timeline.sort(key=lambda i: (i["onset_min_years"], -_SEVERITY_RANK[i["severity"]]))
    return timeline
