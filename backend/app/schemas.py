from datetime import date as Date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

Species = Literal["dog", "cat"]


class RegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    email: EmailStr
    avatar_url: Optional[str] = None  # relative to the API base URL; needs the auth header


class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=80)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)


class PetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    species: Species
    age_years: Optional[float] = Field(default=None, ge=0, le=40)


class PetUpdate(BaseModel):
    """Editable pet fields. Species can't change: reports and breeds are species-specific."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    age_years: Optional[float] = Field(default=None, ge=0, le=40)  # send null to clear the age


class BreedPercent(BaseModel):
    breed: str
    percent: float


class TimelineItem(BaseModel):
    condition: str
    description: str
    symptoms: List[str]
    prevention: List[str]
    severity: str
    onset_min_years: float
    onset_max_years: Optional[float]
    life_stage: str
    from_breeds: List[str]
    ai_generated: bool = False  # default keeps reports saved before this field existed valid


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pet_id: int
    input_method: str
    breed_breakdown: List[BreedPercent]
    biological_age: Optional[float]
    timeline: List[TimelineItem]
    created_at: datetime


class PetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    species: Species
    age_years: Optional[float]
    photo_url: Optional[str] = None  # relative to the API base URL; needs the auth header
    created_at: datetime
    latest_report: Optional[ReportOut] = None


class BreedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    species: Species
    name: str
    traits: str
    source: str


class ManualAnalysisIn(BaseModel):
    """Pick a listed breed by id, or type any breed name and it is looked up with AI."""

    breed_id: Optional[int] = None
    breed_name: Optional[str] = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def _exactly_one(self):
        if (self.breed_id is None) == (self.breed_name is None):
            raise ValueError("Provide either breed_id or breed_name")
        return self


CareKind = Literal["checkup", "vaccination", "blood_work", "dental", "medication", "grooming", "other"]
CareStatus = Literal["completed", "upcoming"]


class CareEventIn(BaseModel):
    kind: CareKind
    title: str = Field(min_length=1, max_length=80)
    date: Date
    status: CareStatus
    notes: str = Field(default="", max_length=1000)


class CareEventOut(CareEventIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pet_id: int
