# PawPrint DNA

CPSC 491 project. This is a mobile app that gives pet owners a breed breakdown and a life-stage health risk timeline.

```
mobile/   Expo (React Native) app, JavaScript, Expo Router. Screens live in src/app/
backend/  FastAPI (Python) API with SQLAlchemy. Uses SQLite locally (set DATABASE_URL for Postgres)
```

## Run it

**Backend** (terminal 1):

```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0
```

`--host 0.0.0.0` lets your phone reach the API over Wi-Fi. API docs are at http://localhost:8000/docs.
Breed reference data loads from `app/data/breeds.json` the first time the server starts.

Breeds that aren't in that file are looked up with Claude the first time someone uses them, then
saved to the database (`breeds.source = "ai"`) so each breed is only generated once. This needs
an Anthropic API key in `backend/.env`, which is git-ignored:

```sh
cd backend
cp .env.example .env   # then open .env and paste your key after ANTHROPIC_API_KEY=
```

Restart the server after changing `.env`.

Without a key, the app still works with the curated breeds, but typed-in breeds and photo analysis show a "not set up" message.
The AI code is in `backend/app/services/breed_ai.py`.

**Email (optional):** password reset codes are emailed through any SMTP account set in `backend/.env`
(see `.env.example`; a Gmail App Password works). Without it, the email is printed in the backend
terminal, which is enough for local testing and demos.

**Mobile** (terminal 2):

```sh
cd mobile
npm install        # first time only
npx expo start
```

Scan the QR code with the Expo Go app; your phone and computer must be on the same Wi-Fi network.
The app finds the API on your computer's IP at port 8000. To use a different API address, set
`EXPO_PUBLIC_API_URL`.

**Tests:** `cd backend && .venv/bin/python -m pytest`, plus `cd mobile && npx expo lint`.

## Status

| Proposal feature | Status |
|---|---|
| Register, login, logout, edit profile, change password, delete account | Done |
| Forgot password (emailed 6-digit code → new password) | Done. Without SMTP settings in `backend/.env`, the email is printed in the backend terminal |
| Pet profiles (create, view, edit name and age, delete) | Done |
| Manual breed entry → breed report + health risk timeline | Done |
| Health timeline grouped by life stage, tap a risk for details | Done |
| Photo analysis: 1–3 photos → Claude estimates the breed mix → breed report + health timeline | Done (`POST /pets/{id}/analysis/photo`, `backend/app/services/photo_breed.py`) |
| Pet photos and user profile pictures | Done |
| DNA file upload, biological age, relative matching | Dropped from scope |
| Save report as PDF (breakdown, timeline, care log) | Done, shared through the phone's share sheet |
| Care log (checkups, vaccinations, etc.) | Done |
| Report history (view and delete past reports) | Done |

Both input methods produce a breed breakdown (`[{breed, percent}]`) and pass it to
`backend/app/services/timeline.py`. New input methods only need to produce that breakdown.
