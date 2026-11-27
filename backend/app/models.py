from datetime import date as date_type, datetime, timezone
from typing import List, Optional

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, String, Text, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .photos import AVATARS, PETS, delete_photo


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar_filename: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # see photos.py
    # Password reset: the latest emailed 6-digit code (hashed), when it expires, and wrong tries so far.
    reset_code_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reset_code_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reset_code_attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pets: Mapped[List["Pet"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

    @property
    def avatar_url(self) -> Optional[str]:
        # The file name changes on every upload, so the ?v= part busts the app's image cache.
        if not self.avatar_filename:
            return None
        return f"/auth/me/avatar?v={self.avatar_filename.split('.')[0]}"


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    species: Mapped[str] = mapped_column(String(10))  # "dog" | "cat"
    age_years: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    photo_filename: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # see photos.py
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    owner: Mapped[User] = relationship(back_populates="pets")

    @property
    def photo_url(self) -> Optional[str]:
        # The file name changes on every upload, so the ?v= part busts the app's image cache.
        if not self.photo_filename:
            return None
        return f"/pets/{self.id}/photo?v={self.photo_filename.split('.')[0]}"
    reports: Mapped[List["Report"]] = relationship(
        back_populates="pet", cascade="all, delete-orphan", order_by="Report.created_at.desc()"
    )
    care_events: Mapped[List["CareEvent"]] = relationship(
        back_populates="pet", cascade="all, delete-orphan", order_by="CareEvent.date.desc()"
    )


class Breed(Base):
    """Reference data: one row per known breed. Seeded from data/breeds.json ("curated"), and
    filled in by services/breed_ai.py for breeds that aren't there yet ("ai")."""

    __tablename__ = "breeds"

    id: Mapped[int] = mapped_column(primary_key=True)
    species: Mapped[str] = mapped_column(String(10), index=True)
    name: Mapped[str] = mapped_column(String(80))
    traits: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10), default="curated")  # "curated" | "ai"

    risks: Mapped[List["BreedRisk"]] = relationship(back_populates="breed", cascade="all, delete-orphan")


class BreedRisk(Base):
    __tablename__ = "breed_risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    breed_id: Mapped[int] = mapped_column(ForeignKey("breeds.id", ondelete="CASCADE"), index=True)
    condition: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    symptoms: Mapped[list] = mapped_column(JSON)
    prevention: Mapped[list] = mapped_column(JSON)
    severity: Mapped[str] = mapped_column(String(10))  # "low" | "medium" | "high"
    onset_min_years: Mapped[float] = mapped_column(Float)
    onset_max_years: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    breed: Mapped[Breed] = relationship(back_populates="risks")


class Report(Base):
    """A finished analysis for one pet. Results are stored as a snapshot so history stays stable
    even if reference data changes later."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    input_method: Mapped[str] = mapped_column(String(10))  # "manual" | "photo"
    breed_breakdown: Mapped[list] = mapped_column(JSON)  # [{"breed": str, "percent": float}]
    biological_age: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # unused since DNA upload was dropped
    timeline: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pet: Mapped[Pet] = relationship(back_populates="reports")


class CareEvent(Base):
    """A care log entry for a pet: a checkup, vaccination, etc., done or coming up."""

    __tablename__ = "care_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # see schemas.CareKind
    title: Mapped[str] = mapped_column(String(80))
    date: Mapped[date_type] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10))  # "completed" | "upcoming"
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pet: Mapped[Pet] = relationship(back_populates="care_events")


@event.listens_for(Pet, "after_delete")
def _delete_pet_photo(_mapper, _conn, pet: Pet) -> None:
    # Runs for direct pet deletes and for pets removed when their owner's account is deleted.
    delete_photo(PETS, pet.photo_filename)


@event.listens_for(User, "after_delete")
def _delete_user_avatar(_mapper, _conn, user: User) -> None:
    delete_photo(AVATARS, user.avatar_filename)
