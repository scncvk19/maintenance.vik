"""Destructive PostgreSQL integration test for a dedicated disposable CI database ONLY.

Never run against a real maintenance.vik database. Requires the exact CI database,
loopback host, and an explicit opt-in; it creates and restores records.
"""
import os
import tempfile
from pathlib import Path
from sqlalchemy.engine import make_url

EXPECTED = "postgresql+psycopg://maintenance_ci_test:test-only-postgres-password@127.0.0.1:5432/maintenance_ci_test"
if (os.environ.get("TEST_ALLOW_DESTRUCTIVE_POSTGRES") != "ISOLATED_CI_ONLY"
        or os.environ.get("DATABASE_URL") != EXPECTED):
    raise SystemExit("Refusing destructive test outside the dedicated CI database")
url = make_url(os.environ["DATABASE_URL"])
if url.host != "127.0.0.1" or url.database != "maintenance_ci_test" or url.username != "maintenance_ci_test":
    raise SystemExit("Unexpected database target")

temporary = tempfile.TemporaryDirectory(prefix="maintenance-ci-documents-")
os.environ["DATA_DIR"] = temporary.name

from fastapi.testclient import TestClient  # noqa: E402
from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

assert engine.dialect.name == "postgresql"

try:
    # The target is disposable, but guard against accidentally reusing even that DB.
    from sqlalchemy import inspect  # noqa: E402
    if inspect(engine).has_table("assets"):
        raise SystemExit("CI database is not empty; refusing to run")
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200, health.text
        asset = client.post("/records/assets", json={"name": "PostgreSQL-Testobjekt", "kind": "building"})
        assert asset.status_code == 201, asset.text
        asset_id = asset.json()["id"]
        uploaded = client.post(
            "/documents/upload",
            data={"asset_id": asset_id, "title": "Testbeleg", "document_date": "2026-09-22", "category": "invoice"},
            files={"file": ("beleg.txt", b"CI backup integrity test", "text/plain")},
        )
        assert uploaded.status_code == 201, uploaded.text
        doc_id = uploaded.json()["id"]
        vault = client.post("/tax-vault/setup", json={"password": "nur-ci-testpasswort"})
        assert vault.status_code == 200, vault.text
        old_token = vault.json()["token"]
        case = client.post("/tax-cases", json={"name": "CI-Steuerfall"}, headers={"X-Tax-Session": old_token})
        assert case.status_code == 200, case.text

        backup = client.get("/backup/export")
        assert backup.status_code == 200 and backup.content.startswith(b"PK"), backup.text
        files = {"file": ("maintenance-ci.zip", backup.content, "application/zip")}
        preview = client.post("/backup/preview", files=files)
        assert preview.status_code == 200, preview.text
        assert preview.json()["files"] == 1, preview.text
        extra = client.post("/records/assets", json={"name": "Wird entfernt", "kind": "vehicle"})
        assert extra.status_code == 201, extra.text

        restore = client.post("/backup/import", data={"confirmation": "WIEDERHERSTELLEN"}, files=files)
        assert restore.status_code == 200, restore.text
        rows = client.get("/records/assets")
        assert rows.status_code == 200 and [row["id"] for row in rows.json()] == [asset_id], rows.text
        download = client.get(f"/documents/{doc_id}/download")
        assert download.status_code == 200 and download.content == b"CI backup integrity test"
        assert client.get("/tax-cases", headers={"X-Tax-Session": old_token}).status_code == 423
        unlocked = client.post("/tax-vault/unlock", json={"password": "nur-ci-testpasswort"})
        assert unlocked.status_code == 200, unlocked.text
        cases = client.get("/tax-cases", headers={"X-Tax-Session": unlocked.json()["token"]})
        assert cases.status_code == 200 and cases.json()[0]["name"] == "CI-Steuerfall", cases.text
        print("PostgreSQL: backup export, preview, restore, document and tax vault verified")
finally:
    engine.dispose()
    temporary.cleanup()
