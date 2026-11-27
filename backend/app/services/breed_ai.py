"""Fills in breed reference data with Claude when a breed isn't in the database yet.

The database acts as a cache: each breed is generated once, saved with source="ai", and read from
the database after that. Curated breeds from data/breeds.json are never overwritten.
"""

import logging
from contextlib import contextmanager
from typing import List, Literal, Optional

import anthropic
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Breed, BreedRisk

log = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """You are a veterinary reference for a pet health app. Given a species and a breed \
name typed by a pet owner, return reference data for that breed.

- canonical_name: the breed's standard English name (for example "lab" becomes "Labrador Retriever").
- traits: one or two sentences on temperament and care needs.
- risks: 3 to 8 health conditions with well-documented breed predisposition in veterinary literature. \
Leave out conditions every dog or cat can get unless this breed has a clearly higher risk.
- For each risk: a plain-language description for owners, 2 to 4 symptoms, 2 to 4 prevention or \
screening steps, severity (low, medium or high), and the typical age range in years when signs \
first appear. Use null for onset_max_years when the risk continues for the rest of the pet's life.

If the name is not a recognized breed of the given species (a typo you can't resolve, a made-up name, \
or a breed of the other species), set is_recognized_breed to false and return an empty risks list. \
Mixed breeds such as "Labradoodle" count as recognized when they are commonly known."""


class _AIRisk(BaseModel):
    condition: str
    description: str
    symptoms: List[str]
    prevention: List[str]
    severity: Literal["low", "medium", "high"]
    onset_min_years: float
    onset_max_years: Optional[float]


class _AIBreed(BaseModel):
    is_recognized_breed: bool
    canonical_name: str
    traits: str
    risks: List[_AIRisk]


_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    # Created on first use so the server and tests start without an API key.
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def find_breed(db: Session, species: str, name: str) -> Optional[Breed]:
    """Case-insensitive lookup in the database only."""
    return db.scalar(
        select(Breed)
        .where(Breed.species == species, func.lower(Breed.name) == name.strip().lower())
        .options(selectinload(Breed.risks))
    )


def generate_breed(species: str, name: str) -> Optional[_AIBreed]:
    """Ask Claude for a breed's reference data. Returns None if it isn't a recognized breed."""
    response = _get_client().beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        # If a safety classifier declines, the API retries on a fallback model in the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Species: {species}\nBreed: {name}"}],
        output_format=_AIBreed,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        log.warning("Claude returned no breed data for %s %r (stop_reason=%s)", species, name, response.stop_reason)
        return None
    data = response.parsed_output
    if not data.is_recognized_breed or not data.risks:
        return None
    return data


class AIUnavailableError(Exception):
    """A Claude call couldn't run (no API key, network or API error). The message is shown to users."""


@contextmanager
def ai_errors(what: str):
    """Turn SDK errors from a Claude call into AIUnavailableError with a user-facing message."""
    try:
        yield
    except TypeError as e:
        # The SDK raises TypeError when no API key or other credentials are configured.
        log.error("%s is not set up: %s", what, e)
        raise AIUnavailableError(
            f"{what} isn't set up on the server. Set ANTHROPIC_API_KEY and restart the backend."
        ) from e
    except anthropic.AuthenticationError as e:
        log.error("Anthropic rejected the API key: %s", e)
        raise AIUnavailableError("The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY.") from e
    except anthropic.AnthropicError as e:
        # Network errors, rate limits, low credit balance and other API errors.
        log.exception("%s failed", what)
        raise AIUnavailableError(f"{what} failed. Please try again.") from e


def get_or_create_breed(db: Session, species: str, name: str) -> Optional[Breed]:
    """Return the breed from the database, generating and saving it with Claude if it's missing.

    Returns None when the name isn't a recognized breed. Raises AIUnavailableError when the AI
    call itself fails, so callers can tell "not a breed" apart from "couldn't check".
    """
    breed = find_breed(db, species, name)
    if breed is not None:
        return breed

    with ai_errors("AI breed lookup"):
        data = generate_breed(species, name)
    if data is None:
        return None

    # "lab" can resolve to a breed we already have under its full name.
    existing = find_breed(db, species, data.canonical_name)
    if existing is not None:
        return existing

    breed = Breed(species=species, name=data.canonical_name.strip()[:80], traits=data.traits, source="ai")
    breed.risks = [BreedRisk(**risk.model_dump()) for risk in data.risks]
    db.add(breed)
    db.commit()
    return breed
