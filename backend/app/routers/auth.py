import logging

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import (
    RESET_CODE_MAX_ATTEMPTS,
    RESET_CODE_RESEND_AFTER,
    RESET_CODE_TTL,
    create_access_token,
    get_current_user,
    hash_password,
    hash_reset_code,
    new_reset_code,
    reset_code_matches,
    verify_password,
)
from ..emailer import send_email
from ..db import get_db
from ..models import User
from ..photos import AVATARS, delete_photo, photo_response, save_photo

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("pawprint")


def _by_email(db: Session, email: str):
    return db.scalar(select(User).where(User.email == email.lower()))


@router.post("/register", response_model=schemas.TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    if _by_email(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        email=body.email.lower(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    return schemas.TokenOut(access_token=create_access_token(user))


@router.post("/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = _by_email(db, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return schemas.TokenOut(access_token=create_access_token(user))


def _utc(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; they were stored in UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(body: schemas.ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Email a 6-digit reset code. The response is the same whether or not the email has an account."""
    user = _by_email(db, body.email)
    now = datetime.now(timezone.utc)
    issued_recently = (
        user is not None
        and user.reset_code_expires_at is not None
        and _utc(user.reset_code_expires_at) - RESET_CODE_TTL + RESET_CODE_RESEND_AFTER > now
    )
    if user is not None and not issued_recently:
        code = new_reset_code()
        user.reset_code_hash = hash_reset_code(user, code)
        user.reset_code_expires_at = now + RESET_CODE_TTL
        user.reset_code_attempts = 0
        db.commit()
        # Sent after the response so response time doesn't reveal whether the account exists.
        background.add_task(
            send_email,
            user.email,
            "Your PawPrint DNA reset code",
            f"Hi {user.first_name},\n\n"
            f"Your PawPrint DNA password reset code is: {code}\n\n"
            f"It expires in {int(RESET_CODE_TTL.total_seconds() // 60)} minutes. "
            "If you didn't ask to reset your password, you can ignore this email.",
        )
    return {"detail": "If that email has an account, we've sent it a 6-digit code."}


@router.post("/reset-password", response_model=schemas.TokenOut)
def reset_password(body: schemas.ResetPasswordIn, db: Session = Depends(get_db)):
    """Set a new password with the emailed code, and sign in."""
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "That code is invalid or has expired. Request a new one.")
    user = _by_email(db, body.email)
    if (
        user is None
        or user.reset_code_hash is None
        or _utc(user.reset_code_expires_at) < datetime.now(timezone.utc)
        or user.reset_code_attempts >= RESET_CODE_MAX_ATTEMPTS
    ):
        raise invalid

    if not reset_code_matches(user, body.code):
        user.reset_code_attempts += 1
        db.commit()
        left = RESET_CODE_MAX_ATTEMPTS - user.reset_code_attempts
        if left <= 0:
            raise invalid
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left."
        )

    user.password_hash = hash_password(body.new_password)  # also signs out other devices
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    user.reset_code_attempts = 0
    db.commit()
    return schemas.TokenOut(access_token=create_access_token(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=schemas.UserOut)
def update_me(
    body: schemas.UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value.strip())
    db.commit()
    return user


@router.put("/me/avatar", response_model=schemas.UserOut)
async def upload_avatar(
    photo: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    filename = await save_photo(photo, AVATARS)
    old = user.avatar_filename
    user.avatar_filename = filename
    db.commit()
    delete_photo(AVATARS, old)
    return user


@router.get("/me/avatar")
def get_avatar(user: User = Depends(get_current_user)):
    return photo_response(AVATARS, user.avatar_filename)


@router.delete("/me/avatar", response_model=schemas.UserOut)
def remove_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    old = user.avatar_filename
    user.avatar_filename = None
    db.commit()
    delete_photo(AVATARS, old)
    return user


@router.post("/me/password", response_model=schemas.TokenOut)
def change_password(
    body: schemas.PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()
  
    return schemas.TokenOut(access_token=create_access_token(user))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)  # cascades to pets and reports
    db.commit()
