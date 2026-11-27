import os
import tempfile

# Point the app at a throwaway database before it is imported.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_tmp, "test.db")
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def register(client, email="owner@example.com", password="password123"):
    res = client.post(
        "/auth/register",
        json={"first_name": "Ada", "last_name": "Lee", "email": email, "password": password},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_register_login_and_duplicate(client):
    register(client, "a@example.com")
    assert client.post(
        "/auth/register",
        json={"first_name": "A", "last_name": "B", "email": "A@example.com", "password": "password123"},
    ).status_code == 409
    assert client.post("/auth/login", json={"email": "a@example.com", "password": "nope"}).status_code == 401
    assert client.post("/auth/login", json={"email": "a@example.com", "password": "password123"}).status_code == 200


def test_requires_auth(client):
    assert client.get("/pets").status_code == 401


def test_manual_analysis_builds_timeline(client):
    headers = register(client, "b@example.com")
    pet = client.post("/pets", json={"name": "Mochi", "species": "cat", "age_years": 1}, headers=headers).json()
    breed = next(b for b in client.get("/breeds?species=cat").json() if b["name"] == "Domestic Shorthair")

    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_id": breed["id"]}, headers=headers)
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["breed_breakdown"] == [{"breed": "Domestic Shorthair", "percent": 100.0}]
    conditions = [i["condition"] for i in report["timeline"]]
    assert conditions == ["Dental Disease", "Chronic Kidney Disease", "Hyperthyroidism"]
    assert report["timeline"][1]["life_stage"] == "senior"

    listed = client.get("/pets", headers=headers).json()
    assert listed[0]["latest_report"]["id"] == report["id"]


def test_wrong_species_breed_rejected(client):
    headers = register(client, "c@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    cat_breed = client.get("/breeds?species=cat").json()[0]
    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_id": cat_breed["id"]}, headers=headers)
    assert res.status_code == 422


def test_cannot_see_other_users_pets(client):
    owner = register(client, "d@example.com")
    other = register(client, "e@example.com")
    pet = client.post("/pets", json={"name": "Tofu", "species": "cat"}, headers=owner).json()
    assert client.get(f"/pets/{pet['id']}", headers=other).status_code == 404
    assert client.delete(f"/pets/{pet['id']}", headers=other).status_code == 404


def test_password_change_invalidates_old_token(client):
    headers = register(client, "f@example.com")
    res = client.post(
        "/auth/me/password",
        json={"current_password": "password123", "new_password": "newpassword456"},
        headers=headers,
    )
    assert res.status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/auth/me", headers=new_headers).status_code == 200


def test_delete_account_removes_everything(client):
    headers = register(client, "g@example.com")
    client.post("/pets", json={"name": "Pepper", "species": "cat"}, headers=headers)
    assert client.delete("/auth/me", headers=headers).status_code == 204
    assert client.post("/auth/login", json={"email": "g@example.com", "password": "password123"}).status_code == 401


# --- AI breed lookup (Claude is mocked; no API key or network needed) ---

from app.services import breed_ai  # noqa: E402

FAKE_CORGI = breed_ai._AIBreed(
    is_recognized_breed=True,
    canonical_name="Pembroke Welsh Corgi",
    traits="Alert, affectionate herding dog.",
    risks=[
        breed_ai._AIRisk(
            condition="Intervertebral Disc Disease",
            description="Spinal discs can bulge or rupture and press on the spinal cord.",
            symptoms=["Back pain", "Reluctance to jump"],
            prevention=["Keep a lean weight", "Use ramps instead of stairs"],
            severity="high",
            onset_min_years=3,
            onset_max_years=7,
        )
    ],
)


@pytest.fixture
def fake_claude(monkeypatch):
    calls = []

    def fake_generate(species, name):
        calls.append((species, name))
        if name.lower() in ("corgi", "pembroke welsh corgi"):
            return FAKE_CORGI
        return None  # not a recognized breed

    monkeypatch.setattr(breed_ai, "generate_breed", fake_generate)
    return calls


def test_manual_analysis_by_name_uses_ai_once_then_caches(client, fake_claude):
    headers = register(client, "h@example.com")
    pet = client.post("/pets", json={"name": "Biscuit", "species": "dog"}, headers=headers).json()

    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "corgi"}, headers=headers)
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["breed_breakdown"] == [{"breed": "Pembroke Welsh Corgi", "percent": 100.0}]
    assert report["timeline"][0]["condition"] == "Intervertebral Disc Disease"
    assert report["timeline"][0]["ai_generated"] is True

    # Saved to the database: shows up in the list and isn't generated again.
    listed = {b["name"]: b for b in client.get("/breeds?species=dog").json()}
    assert listed["Pembroke Welsh Corgi"]["source"] == "ai"
    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "PEMBROKE WELSH CORGI"}, headers=headers)
    assert res.status_code == 201
    assert fake_claude == [("dog", "corgi")]


def test_curated_breed_by_name_skips_ai(client, fake_claude):
    headers = register(client, "i@example.com")
    pet = client.post("/pets", json={"name": "Mochi", "species": "cat"}, headers=headers).json()
    res = client.post(
        f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "domestic shorthair"}, headers=headers
    )
    assert res.status_code == 201
    assert res.json()["timeline"][0]["ai_generated"] is False
    assert fake_claude == []


def test_unrecognized_breed_name_rejected(client, fake_claude):
    headers = register(client, "j@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "Dragon"}, headers=headers)
    assert res.status_code == 422


def test_manual_analysis_needs_exactly_one_breed_field(client):
    headers = register(client, "k@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    url = f"/pets/{pet['id']}/analysis/manual"
    assert client.post(url, json={}, headers=headers).status_code == 422
    assert client.post(url, json={"breed_id": 1, "breed_name": "Beagle"}, headers=headers).status_code == 422


def test_ai_not_configured_gives_clear_error(client, monkeypatch):
    # No credentials: the SDK raises TypeError. Typed breeds get a 503 that says why,
    # not a misleading "Unknown breed".
    def no_key(*args, **kwargs):
        raise TypeError("Could not resolve authentication method")

    monkeypatch.setattr(breed_ai, "generate_breed", no_key)
    headers = register(client, "m@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "Basenji"}, headers=headers)
    assert res.status_code == 503
    assert "ANTHROPIC_API_KEY" in res.json()["detail"]

    # The timeline path skips the breed it couldn't look up instead of failing.
    from app.db import SessionLocal
    from app.services.timeline import build_timeline

    with SessionLocal() as db:
        timeline = build_timeline(
            db, "dog", [{"breed": "Beagle", "percent": 50}, {"breed": "Basenji", "percent": 50}]
        )
    assert timeline and all(item["from_breeds"] == ["Beagle"] for item in timeline)


def test_ai_canonical_name_matches_curated_breed(client, monkeypatch):
    # A typo goes to the AI, which resolves it to a breed we already have; no duplicate is made.
    monkeypatch.setattr(
        breed_ai, "generate_breed", lambda s, n: FAKE_CORGI.model_copy(update={"canonical_name": "Beagle"})
    )
    headers = register(client, "l@example.com")
    pet = client.post("/pets", json={"name": "Snoopy", "species": "dog"}, headers=headers).json()
    res = client.post(f"/pets/{pet['id']}/analysis/manual", json={"breed_name": "beagel"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["timeline"][0]["ai_generated"] is False
    assert [b["name"] for b in client.get("/breeds?species=dog").json()].count("Beagle") == 1


# --- Pet photos ---

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def test_pet_photo_upload_view_replace_remove(client):
    from app.photos import PETS, UPLOAD_DIR

    PHOTO_DIR = UPLOAD_DIR / PETS

    headers = register(client, "p@example.com")
    pet = client.post("/pets", json={"name": "Nori", "species": "cat"}, headers=headers).json()
    assert pet["photo_url"] is None

    res = client.put(f"/pets/{pet['id']}/photo", files={"photo": ("a.png", PNG, "image/png")}, headers=headers)
    assert res.status_code == 200, res.text
    first_url = res.json()["photo_url"]
    img = client.get(first_url, headers=headers)
    assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content == PNG

    # Replacing gives a new URL and removes the old file.
    res = client.put(f"/pets/{pet['id']}/photo", files={"photo": ("b.jpg", JPEG, "image/jpeg")}, headers=headers)
    second_url = res.json()["photo_url"]
    assert second_url != first_url
    assert client.get(second_url, headers=headers).headers["content-type"] == "image/jpeg"
    assert len(list(PHOTO_DIR.iterdir())) == 1

    # Other users can't see it, and it needs a login.
    other = register(client, "q@example.com")
    assert client.get(second_url, headers=other).status_code == 404
    assert client.get(second_url).status_code == 401

    res = client.delete(f"/pets/{pet['id']}/photo", headers=headers)
    assert res.json()["photo_url"] is None
    assert client.get(second_url, headers=headers).status_code == 404
    assert list(PHOTO_DIR.iterdir()) == []


def test_pet_photo_rejects_non_images(client):
    headers = register(client, "r@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    res = client.put(
        f"/pets/{pet['id']}/photo", files={"photo": ("x.png", b"not an image", "image/png")}, headers=headers
    )
    assert res.status_code == 422


def test_deleting_pet_or_account_deletes_photo_file(client):
    from app.photos import PETS, UPLOAD_DIR

    PHOTO_DIR = UPLOAD_DIR / PETS

    headers = register(client, "s@example.com")
    for name in ("One", "Two"):
        pet = client.post("/pets", json={"name": name, "species": "dog"}, headers=headers).json()
        client.put(f"/pets/{pet['id']}/photo", files={"photo": ("a.png", PNG, "image/png")}, headers=headers)
    before = len(list(PHOTO_DIR.iterdir()))

    assert client.delete(f"/pets/{pet['id']}", headers=headers).status_code == 204
    assert len(list(PHOTO_DIR.iterdir())) == before - 1
    assert client.delete("/auth/me", headers=headers).status_code == 204
    assert len(list(PHOTO_DIR.iterdir())) == before - 2


def test_avatar_upload_view_replace_remove(client):
    from app.photos import AVATARS, UPLOAD_DIR

    folder = UPLOAD_DIR / AVATARS
    headers = register(client, "t@example.com")
    assert client.get("/auth/me", headers=headers).json()["avatar_url"] is None

    res = client.put("/auth/me/avatar", files={"photo": ("a.png", PNG, "image/png")}, headers=headers)
    assert res.status_code == 200, res.text
    first_url = res.json()["avatar_url"]
    assert client.get("/auth/me", headers=headers).json()["avatar_url"] == first_url
    img = client.get(first_url, headers=headers)
    assert img.status_code == 200 and img.content == PNG

    res = client.put("/auth/me/avatar", files={"photo": ("b.jpg", JPEG, "image/jpeg")}, headers=headers)
    second_url = res.json()["avatar_url"]
    assert second_url != first_url
    before = len(list(folder.iterdir()))

    # Each user only ever sees their own avatar at /auth/me/avatar.
    other = register(client, "u@example.com")
    assert client.get(second_url, headers=other).status_code == 404
    assert client.get(second_url).status_code == 401

    assert client.delete("/auth/me/avatar", headers=headers).json()["avatar_url"] is None
    assert len(list(folder.iterdir())) == before - 1

    # Deleting the account deletes the avatar file too.
    client.put("/auth/me/avatar", files={"photo": ("a.png", PNG, "image/png")}, headers=headers)
    assert client.delete("/auth/me", headers=headers).status_code == 204
    assert len(list(folder.iterdir())) == before - 1


def test_avatar_rejects_non_images(client):
    headers = register(client, "v@example.com")
    res = client.put("/auth/me/avatar", files={"photo": ("x.png", b"nope", "image/png")}, headers=headers)
    assert res.status_code == 422


# --- Photo breed analysis (Claude is mocked) ---

from app.services import photo_breed  # noqa: E402


def fake_estimate(shows_pet=True, breeds=(("Labrador Retriever", 60), ("Beagle", 35), ("Corgi?", 0))):
    def estimate(species, photos, known_breed, known_names):
        estimate.calls.append({"species": species, "count": len(photos), "known_breed": known_breed,
                               "known_names": known_names})
        return photo_breed._PhotoEstimate(
            shows_pet=shows_pet,
            problem=None if shows_pet else "This photo looks like a cat, not a dog.",
            breeds=[photo_breed._BreedGuess(breed=b, percent=p) for b, p in breeds] if shows_pet else [],
        )

    estimate.calls = []
    return estimate


def test_photo_analysis_builds_report_and_sets_pet_photo(client, monkeypatch):
    estimate = fake_estimate()
    monkeypatch.setattr(photo_breed, "estimate_breeds", estimate)
    headers = register(client, "w@example.com")
    pet = client.post("/pets", json={"name": "Max", "species": "dog"}, headers=headers).json()

    res = client.post(
        f"/pets/{pet['id']}/analysis/photo",
        files=[("photos", ("a.jpg", JPEG, "image/jpeg")), ("photos", ("b.png", PNG, "image/png"))],
        data={"known_breed": "  lab  "},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["input_method"] == "photo"
    # Zero-percent guesses dropped; shares rescaled to whole numbers summing to 100.
    assert report["breed_breakdown"] == [
        {"breed": "Labrador Retriever", "percent": 63.0},
        {"breed": "Beagle", "percent": 37.0},
    ]
    conditions = {i["condition"] for i in report["timeline"]}
    assert "Hip Dysplasia" in conditions  # from the curated Labrador data
    call = estimate.calls[0]
    assert call["count"] == 2 and call["known_breed"] == "lab" and "Beagle" in call["known_names"]

    # The first photo became the pet's profile picture.
    pet = client.get(f"/pets/{pet['id']}", headers=headers).json()
    assert pet["photo_url"] and client.get(pet["photo_url"], headers=headers).content == JPEG
    assert pet["latest_report"]["id"] == report["id"]


def test_photo_analysis_wrong_animal_is_rejected(client, monkeypatch):
    monkeypatch.setattr(photo_breed, "estimate_breeds", fake_estimate(shows_pet=False))
    headers = register(client, "x@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    res = client.post(
        f"/pets/{pet['id']}/analysis/photo", files=[("photos", ("a.jpg", JPEG, "image/jpeg"))], headers=headers
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "This photo looks like a cat, not a dog."
    # Nothing saved for a failed analysis.
    assert client.get(f"/pets/{pet['id']}", headers=headers).json()["photo_url"] is None


def test_photo_analysis_input_checks(client, monkeypatch):
    estimate = fake_estimate()
    monkeypatch.setattr(photo_breed, "estimate_breeds", estimate)
    headers = register(client, "y@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    url = f"/pets/{pet['id']}/analysis/photo"

    too_many = [("photos", (f"{i}.jpg", JPEG, "image/jpeg")) for i in range(4)]
    assert client.post(url, files=too_many, headers=headers).status_code == 422
    assert client.post(url, files=[("photos", ("x.jpg", b"nope", "image/jpeg"))], headers=headers).status_code == 422
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32
    res = client.post(url, files=[("photos", ("x.heic", heic, "image/heic"))], headers=headers)
    assert res.status_code == 422 and "HEIC" in res.json()["detail"]
    assert estimate.calls == []  # Claude is never called for invalid input


def test_photo_analysis_without_api_key(client, monkeypatch):
    def no_key(*args, **kwargs):
        raise TypeError("Could not resolve authentication method")

    monkeypatch.setattr(photo_breed, "estimate_breeds", no_key)
    headers = register(client, "z@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    res = client.post(
        f"/pets/{pet['id']}/analysis/photo", files=[("photos", ("a.jpg", JPEG, "image/jpeg"))], headers=headers
    )
    assert res.status_code == 503 and "ANTHROPIC_API_KEY" in res.json()["detail"]


def test_dna_endpoint_removed(client):
    headers = register(client, "aa@example.com")
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=headers).json()
    assert client.post(f"/pets/{pet['id']}/analysis/dna", headers=headers).status_code in (404, 405)


# --- Report history ---


def test_report_history_list_view_delete(client):
    headers = register(client, "bb@example.com")
    pet = client.post("/pets", json={"name": "Mochi", "species": "cat"}, headers=headers).json()
    cats = {b["name"]: b["id"] for b in client.get("/breeds?species=cat").json()}
    url = f"/pets/{pet['id']}/analysis/manual"
    first = client.post(url, json={"breed_id": cats["Siamese"]}, headers=headers).json()
    second = client.post(url, json={"breed_id": cats["Persian"]}, headers=headers).json()

    # Newest first, and the pet's latest report is the newest one.
    history = client.get(f"/pets/{pet['id']}/reports", headers=headers).json()
    assert [r["id"] for r in history] == [second["id"], first["id"]]
    assert client.get(f"/pets/{pet['id']}", headers=headers).json()["latest_report"]["id"] == second["id"]

    old = client.get(f"/pets/{pet['id']}/reports/{first['id']}", headers=headers)
    assert old.status_code == 200 and old.json()["breed_breakdown"][0]["breed"] == "Siamese"

    # Deleting the newest report makes the older one the latest again.
    assert client.delete(f"/pets/{pet['id']}/reports/{second['id']}", headers=headers).status_code == 204
    assert client.get(f"/pets/{pet['id']}", headers=headers).json()["latest_report"]["id"] == first["id"]
    assert client.get(f"/pets/{pet['id']}/reports/{second['id']}", headers=headers).status_code == 404


def test_reports_are_private_and_scoped_to_their_pet(client):
    owner = register(client, "cc@example.com")
    other = register(client, "dd@example.com")
    cats = {b["name"]: b["id"] for b in client.get("/breeds?species=cat").json()}
    pet = client.post("/pets", json={"name": "Tofu", "species": "cat"}, headers=owner).json()
    pet2 = client.post("/pets", json={"name": "Pepper", "species": "cat"}, headers=owner).json()
    report = client.post(
        f"/pets/{pet['id']}/analysis/manual", json={"breed_id": cats["Ragdoll"]}, headers=owner
    ).json()

    assert client.get(f"/pets/{pet['id']}/reports", headers=other).status_code == 404
    assert client.get(f"/pets/{pet['id']}/reports/{report['id']}", headers=other).status_code == 404
    assert client.delete(f"/pets/{pet['id']}/reports/{report['id']}", headers=other).status_code == 404
    # A report can't be reached through a different pet's URL.
    assert client.get(f"/pets/{pet2['id']}/reports/{report['id']}", headers=owner).status_code == 404
    assert client.delete(f"/pets/{pet2['id']}/reports/{report['id']}", headers=owner).status_code == 404


# --- Care log ---


def test_care_log_add_list_edit_delete(client):
    headers = register(client, "ee@example.com")
    pet = client.post("/pets", json={"name": "Mochi", "species": "cat"}, headers=headers).json()
    url = f"/pets/{pet['id']}/care"

    def add(**fields):
        body = {"kind": "checkup", "title": "Checkup", "date": "2026-02-10", "status": "completed", **fields}
        res = client.post(url, json=body, headers=headers)
        assert res.status_code == 201, res.text
        return res.json()

    checkup = add(notes="All good")
    add(kind="vaccination", title="Rabies booster", date="2025-08-01")
    add(kind="dental", title="Dental cleaning", date="2026-12-05", status="upcoming")

    # Newest date first.
    assert [e["title"] for e in client.get(url, headers=headers).json()] == [
        "Dental cleaning", "Checkup", "Rabies booster",
    ]

    edited = client.put(
        f"{url}/{checkup['id']}",
        json={"kind": "blood_work", "title": "Blood work", "date": "2026-02-11", "status": "completed", "notes": ""},
        headers=headers,
    ).json()
    assert edited["title"] == "Blood work" and edited["date"] == "2026-02-11" and edited["kind"] == "blood_work"

    assert client.delete(f"{url}/{checkup['id']}", headers=headers).status_code == 204
    assert len(client.get(url, headers=headers).json()) == 2

    # Validation.
    bad = {"kind": "surgery", "title": "X", "date": "2026-01-01", "status": "completed"}
    assert client.post(url, json=bad, headers=headers).status_code == 422
    assert client.post(url, json={**bad, "kind": "other", "title": ""}, headers=headers).status_code == 422
    assert client.post(url, json={**bad, "kind": "other", "date": "soon"}, headers=headers).status_code == 422


def test_care_log_is_private_and_deleted_with_pet(client):
    from app.db import SessionLocal
    from app.models import CareEvent

    owner = register(client, "ff@example.com")
    other = register(client, "gg@example.com")
    pet = client.post("/pets", json={"name": "Tofu", "species": "cat"}, headers=owner).json()
    entry = client.post(
        f"/pets/{pet['id']}/care",
        json={"kind": "other", "title": "Nail trim", "date": "2026-03-01", "status": "completed"},
        headers=owner,
    ).json()

    assert client.get(f"/pets/{pet['id']}/care", headers=other).status_code == 404
    assert client.delete(f"/pets/{pet['id']}/care/{entry['id']}", headers=other).status_code == 404

    client.delete(f"/pets/{pet['id']}", headers=owner)
    with SessionLocal() as db:
        assert db.get(CareEvent, entry["id"]) is None


# --- Password reset with an emailed 6-digit code ---

import re  # noqa: E402

from app.routers import auth as auth_router  # noqa: E402


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(auth_router, "send_email", lambda to, subject, body: sent.append((to, body)))
    return sent


def _code(body):
    return re.search(r"\b(\d{6})\b", body).group(1)


def test_password_reset_with_code(client, outbox):
    old_headers = register(client, "reset@example.com", "oldpassword1")
    res = client.post("/auth/forgot-password", json={"email": "Reset@Example.com"})
    assert res.status_code == 202
    assert len(outbox) == 1 and outbox[0][0] == "reset@example.com"
    code = _code(outbox[0][1])

    res = client.post(
        "/auth/reset-password", json={"email": "reset@example.com", "code": code, "new_password": "newpassword2"}
    )
    assert res.status_code == 200, res.text
    new_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/auth/me", headers=new_headers).status_code == 200
    # Old sessions are signed out, the new password works, and the code can't be reused.
    assert client.get("/auth/me", headers=old_headers).status_code == 401
    assert client.post("/auth/login", json={"email": "reset@example.com", "password": "newpassword2"}).status_code == 200
    again = client.post(
        "/auth/reset-password", json={"email": "reset@example.com", "code": code, "new_password": "another123"}
    )
    assert again.status_code == 400


def test_password_reset_wrong_codes_lock_out(client, outbox):
    register(client, "guess@example.com")
    client.post("/auth/forgot-password", json={"email": "guess@example.com"})
    code = _code(outbox[0][1])
    wrong = "000000" if code != "000000" else "111111"
    body = {"email": "guess@example.com", "code": wrong, "new_password": "newpassword2"}

    for left in (4, 3, 2, 1):
        res = client.post("/auth/reset-password", json=body)
        assert res.status_code == 400 and f"{left} tr" in res.json()["detail"]
    assert "invalid or has expired" in client.post("/auth/reset-password", json=body).json()["detail"]
    # After 5 wrong tries even the right code is refused until a new one is requested.
    assert client.post("/auth/reset-password", json={**body, "code": code}).status_code == 400


def test_password_reset_expired_code_and_no_account_leak(client, outbox):
    from datetime import datetime, timedelta, timezone

    from app.db import SessionLocal
    from app.models import User

    register(client, "late@example.com")
    client.post("/auth/forgot-password", json={"email": "late@example.com"})
    code = _code(outbox[0][1])
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="late@example.com").one()
        user.reset_code_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    res = client.post(
        "/auth/reset-password", json={"email": "late@example.com", "code": code, "new_password": "newpassword2"}
    )
    assert res.status_code == 400

    # Unknown emails get the same response and no email is sent.
    unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    known = client.post("/auth/forgot-password", json={"email": "late@example.com"})
    assert unknown.status_code == known.status_code == 202 and unknown.json() == known.json()
    assert all(to != "nobody@example.com" for to, _ in outbox)


def test_password_reset_resend_is_rate_limited(client, outbox):
    register(client, "spam@example.com")
    for _ in range(3):
        client.post("/auth/forgot-password", json={"email": "spam@example.com"})
    assert len(outbox) == 1  # one code per minute
    bad = {"email": "spam@example.com", "code": "12ab56", "new_password": "newpassword2"}
    assert client.post("/auth/reset-password", json=bad).status_code == 422


# --- Editing a pet ---


def test_edit_pet_name_and_age(client):
    headers = register(client, "hh@example.com")
    pet = client.post("/pets", json={"name": "Oso", "species": "dog", "age_years": 2}, headers=headers).json()
    url = f"/pets/{pet['id']}"

    res = client.patch(url, json={"name": "  Oso Bear ", "age_years": 2.5}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Oso Bear" and res.json()["age_years"] == 2.5

    # Only the fields sent change; null clears the age.
    assert client.patch(url, json={"age_years": None}, headers=headers).json() == {
        **res.json(), "age_years": None,
    }
    assert client.get(url, headers=headers).json()["name"] == "Oso Bear"

    # Validation, and species can't be changed.
    assert client.patch(url, json={"name": "   "}, headers=headers).status_code == 422
    assert client.patch(url, json={"name": None}, headers=headers).status_code == 422
    assert client.patch(url, json={"age_years": 41}, headers=headers).status_code == 422
    client.patch(url, json={"species": "cat"}, headers=headers)
    assert client.get(url, headers=headers).json()["species"] == "dog"

    other = register(client, "ii@example.com")
    assert client.patch(url, json={"name": "Mine"}, headers=other).status_code == 404
