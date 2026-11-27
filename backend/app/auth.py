import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

# Set PAWPRINT_SECRET in any real deployment; the fallback is only for local development.
SECRET_KEY = os.getenv("PAWPRINT_SECRET", "dev-only-insecure-secret-change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(days=7)
RESET_CODE_TTL = timedelta(minutes=15)
RESET_CODE_MAX_ATTEMPTS = 5
RESET_CODE_RESEND_AFTER = timedelta(seconds=60)

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _make_token(user: User, purpose: str, ttl: timedelta) -> str:
    payload = {
        "sub": str(user.id),
        "purpose": purpose,
        # Binding to the current hash means a password change invalidates outstanding tokens.
        "pwv": user.password_hash[-12:],
        "exp": datetime.now(timezone.utc) + ttl,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user: User) -> str:
    return _make_token(user, "access", ACCESS_TOKEN_TTL)


def new_reset_code() -> str:
    """A random 6-digit code, e.g. "042917"."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_reset_code(user: User, code: str) -> str:
    # Keyed with the server secret and the user id, so a leaked database doesn't reveal codes.
    return hmac.new(SECRET_KEY.encode(), f"{user.id}:{code}".encode(), hashlib.sha256).hexdigest()


def reset_code_matches(user: User, code: str) -> bool:
    return bool(user.reset_code_hash) and hmac.compare_digest(user.reset_code_hash, hash_reset_code(user, code))


def user_from_token(token: str, purpose: str, db: Session) -> User:
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise invalid
    if payload.get("purpose") != purpose:
        raise invalid
    user = db.get(User, int(payload["sub"]))
    if user is None or user.password_hash[-12:] != payload.get("pwv"):
        raise invalid
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user_from_token(creds.credentials, "access", db)
