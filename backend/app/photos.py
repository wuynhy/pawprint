"""Image storage on local disk, for pet photos and user avatars.

Files live in UPLOAD_DIR/<folder> (default backend/uploads/pets and backend/uploads/avatars) under
random names. The database only stores the file name, and a new upload gets a new name so the app
never shows a stale cached image.
"""

import os
import uuid
from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException, UploadFile, status

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).resolve().parent.parent / "uploads"))
PETS = "pets"
AVATARS = "avatars"
MAX_BYTES = 10 * 1024 * 1024

# Detect the type from the file's first bytes instead of trusting the client's Content-Type.
_SIGNATURES = {
    "jpg": lambda h: h.startswith(b"\xff\xd8\xff"),
    "png": lambda h: h.startswith(b"\x89PNG\r\n\x1a\n"),
    "webp": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP",
    "heic": lambda h: h[4:8] == b"ftyp" and h[8:12] in (b"heic", b"heix", b"mif1", b"msf1"),
}
MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic"}


def _detect_ext(header: bytes) -> Optional[str]:
    return next((ext for ext, matches in _SIGNATURES.items() if matches(header)), None)


async def read_image(upload: UploadFile, max_bytes: int = MAX_BYTES) -> Tuple[bytes, str]:
    """Read an uploaded image and check its size and type. Returns (bytes, extension)."""
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"Photo must be {max_bytes // (1024 * 1024)} MB or smaller"
        )
    ext = _detect_ext(data[:16])
    if ext is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Photo must be a JPEG, PNG, WebP or HEIC image")
    return data, ext


def store_image(data: bytes, ext: str, folder: str) -> str:
    """Write already-validated image bytes to disk. Returns the stored file name."""
    (UPLOAD_DIR / folder).mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    (UPLOAD_DIR / folder / filename).write_bytes(data)
    return filename


async def save_photo(upload: UploadFile, folder: str) -> str:
    """Validate and store an uploaded image. Returns the stored file name."""
    data, ext = await read_image(upload)
    return store_image(data, ext, folder)


def photo_path(folder: str, filename: str) -> Path:
    return UPLOAD_DIR / folder / filename


def delete_photo(folder: str, filename: Optional[str]) -> None:
    if filename:
        photo_path(folder, filename).unlink(missing_ok=True)


def photo_response(folder: str, filename: Optional[str]):
    """Serve a stored image to its owner, or 404 if there isn't one."""
    from fastapi.responses import FileResponse

    if not filename or not photo_path(folder, filename).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No photo")
    # Each upload has a new URL, so the app can cache an image for as long as it likes.
    return FileResponse(
        photo_path(folder, filename),
        media_type=MEDIA_TYPES[filename.rsplit(".", 1)[-1]],
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
