from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env (e.g. ANTHROPIC_API_KEY) before anything reads the environment. Values already
# set in the terminal take precedence.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from sqlalchemy import inspect, text

from .db import Base, SessionLocal, engine
from .routers import analysis, auth, breeds, care, pets
from .seed import seed_breeds


# create_all() doesn't alter existing tables, so columns added after a database was created are
# added here. Replace with Alembic if the schema keeps changing.
_ADDED_COLUMNS = {
    "breeds": {"source": "VARCHAR(10) NOT NULL DEFAULT 'curated'"},
    "pets": {"photo_filename": "VARCHAR(64)"},
    "users": {
        "avatar_filename": "VARCHAR(64)",
        "reset_code_hash": "VARCHAR(64)",
        "reset_code_expires_at": "DATETIME",
        "reset_code_attempts": "INTEGER NOT NULL DEFAULT 0",
    },
}


def _add_missing_columns() -> None:
    for table, columns in _ADDED_COLUMNS.items():
        existing = {c["name"] for c in inspect(engine).get_columns(table)}
        for name, ddl in columns.items():
            if name not in existing:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    _add_missing_columns()
    with SessionLocal() as db:
        seed_breeds(db)
    yield


app = FastAPI(title="PawPrint DNA API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(breeds.router)
app.include_router(analysis.router)
app.include_router(care.router)


@app.get("/health")
def health():
    return {"status": "ok"}
