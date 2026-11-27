"""Photo Breed Estimation: estimates a pet's breed mix from 1-3 photos with Claude's vision.

The result is a breed breakdown ([{breed, percent}]) like the other input methods, so it flows into
the same Health Timeline Generator.
"""

import base64
import logging
from typing import List, Optional, Tuple

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Breed
from .breed_ai import MODEL, _get_client, ai_errors

log = logging.getLogger(__name__)

MAX_PHOTOS = 3
# Claude accepts JPEG, PNG, GIF and WebP (not HEIC), up to 10 MB per image once base64-encoded.
CLAUDE_MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
MAX_PHOTO_BYTES = 7 * 1024 * 1024  # ~9.3 MB after base64

SYSTEM_PROMPT = """You estimate a pet's breed mix from photos for a pet health app. The owner says \
which species the pet is and may say a breed they believe it is.

- Set shows_pet to false if the photos don't clearly show a {species} (for example a different \
animal, no animal, or too blurry or dark to judge), and put a short, friendly reason addressed to \
the owner in problem, such as "This photo looks like a cat, not a dog." Leave breeds empty then.
- Otherwise return 1 to 4 breeds with percentages that add up to 100. The percentages are your \
confidence in the breed mix based on visible traits: coat, color pattern, ears, muzzle, head \
shape, body size and build. A pet that clearly looks purebred can get a single breed at 100.
- If the owner names a known breed, treat it as strong evidence unless the photos clearly contradict it.
- Use standard English breed names. When one of these names fits, use it exactly: {known_names}.
- For cats without a recognizable breed, use "Domestic Shorthair" or "Domestic Longhair".
- Photo-based estimates are uncertain; don't claim certainty you don't have."""


class _BreedGuess(BaseModel):
    breed: str
    percent: float


class _PhotoEstimate(BaseModel):
    shows_pet: bool
    problem: Optional[str]
    breeds: List[_BreedGuess]


class PhotoNotUsable(Exception):
    """The photos don't show a usable pet of the right species. The message is shown to users."""


def _known_breed_names(db: Session, species: str) -> List[str]:
    return list(db.scalars(select(Breed.name).where(Breed.species == species).order_by(Breed.name)))


def estimate_breeds(species: str, photos: List[Tuple[bytes, str]], known_breed: Optional[str], known_names: List[str]):
    """Ask Claude for the breed mix. photos are (bytes, extension) pairs already checked by photos.py."""
    content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": CLAUDE_MEDIA_TYPES[ext],
                "data": base64.standard_b64encode(data).decode("ascii"),
            },
        }
        for data, ext in photos
    ]
    request = f"Species: {species}"
    if known_breed:
        request += f"\nThe owner believes the breed is: {known_breed}"
    content.append({"type": "text", "text": request})

    response = _get_client().beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        # If a safety classifier declines, the API retries on a fallback model in the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT.format(species=species, known_names=", ".join(known_names) or "(none)"),
        messages=[{"role": "user", "content": content}],
        output_format=_PhotoEstimate,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        log.warning("Claude returned no photo estimate (stop_reason=%s)", response.stop_reason)
        return None
    return response.parsed_output


def _normalize(guesses: List[_BreedGuess]) -> List[dict]:
    """Merge duplicate names, drop non-positive shares, and scale to whole percents summing to 100."""
    totals = {}
    for g in guesses:
        name = g.breed.strip()
        if name and g.percent > 0:
            totals[name] = totals.get(name, 0.0) + g.percent
    total = sum(totals.values())
    if not total:
        return []
    breakdown = [{"breed": name, "percent": round(p * 100 / total)} for name, p in totals.items()]
    breakdown = [b for b in breakdown if b["percent"] > 0]
    breakdown.sort(key=lambda b: -b["percent"])
    # Put any rounding remainder on the top breed so the shares add up to exactly 100.
    breakdown[0]["percent"] += 100 - sum(b["percent"] for b in breakdown)
    return [{"breed": b["breed"], "percent": float(b["percent"])} for b in breakdown]


def breakdown_from_photos(
    db: Session, species: str, photos: List[Tuple[bytes, str]], known_breed: Optional[str] = None
) -> List[dict]:
    """Return a breed breakdown for the photos.

    Raises PhotoNotUsable when the photos can't be used, and AIUnavailableError when Claude can't be reached.
    """
    unsupported = [ext for _, ext in photos if ext not in CLAUDE_MEDIA_TYPES]
    if unsupported:
        raise PhotoNotUsable(
            "HEIC photos can't be analyzed. Choose a JPEG or PNG photo, or set your camera to "
            "'Most Compatible' in Settings > Camera > Formats."
        )

    with ai_errors("AI photo analysis"):
        estimate = estimate_breeds(species, photos, known_breed, _known_breed_names(db, species))
    if estimate is None:
        raise PhotoNotUsable("We couldn't analyze these photos. Try different photos.")
    if not estimate.shows_pet:
        raise PhotoNotUsable(estimate.problem or f"We couldn't see a {species} clearly. Try a clearer photo.")
    breakdown = _normalize(estimate.breeds)
    if not breakdown:
        raise PhotoNotUsable("We couldn't estimate a breed from these photos. Try clearer photos.")
    return breakdown
