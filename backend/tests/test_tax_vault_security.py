"""Regression tests use the isolated temporary SQLite database from conftest.py."""
import hashlib
import secrets

from app.database import Session
from app.main import TAX_SESSIONS, tax_key
from app.models import TaxVault


def test_adding_recovery_code_preserves_existing_password_wrapper(client):
    password = "sicheres-testpasswort"
    created = client.post("/tax-vault/setup", json={"password": password})
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    created_case = client.post("/tax-cases", json={"name": "Nur Test"}, headers={"X-Tax-Session": token})
    assert created_case.status_code == 200, created_case.text

    # Simulate a previously configured vault missing its recovery-code metadata.
    with Session() as session:
        vault = session.get(TaxVault, 1)
        original_wrapper = vault.password_wrapped_key
        vault.recovery_salt = ""
        vault.recovery_verifier = ""
        vault.recovery_wrapped_key = ""
        session.commit()

    result = client.post("/tax-vault/recovery-code", headers={"X-Tax-Session": token})
    assert result.status_code == 200, result.text
    assert result.json()["recovery_code"]
    with Session() as session:
        assert session.get(TaxVault, 1).password_wrapped_key == original_wrapper

    client.post("/tax-vault/lock", headers={"X-Tax-Session": token})
    unlocked = client.post("/tax-vault/unlock", json={"password": password})
    assert unlocked.status_code == 200, unlocked.text
    rows = client.get("/tax-cases", headers={"X-Tax-Session": unlocked.json()["token"]})
    assert rows.status_code == 200
    assert rows.json()[0]["name"] == "Nur Test"
    TAX_SESSIONS.clear()


def test_legacy_unwrapped_vault_remains_unlockable_after_recovery_code(client):
    password = "altes-testpasswort"
    salt = secrets.token_bytes(16)
    password_key = tax_key(password, salt)
    with Session() as session:
        session.add(TaxVault(id=1, salt=salt.hex(), verifier=hashlib.sha256(password_key).hexdigest(), password_wrapped_key="", recovery_salt="", recovery_verifier="", recovery_wrapped_key=""))
        session.commit()

    unlocked = client.post("/tax-vault/unlock", json={"password": password})
    assert unlocked.status_code == 200, unlocked.text
    token = unlocked.json()["token"]
    created = client.post("/tax-cases", json={"name": "Altbestand"}, headers={"X-Tax-Session": token})
    assert created.status_code == 200, created.text

    result = client.post("/tax-vault/recovery-code", headers={"X-Tax-Session": token})
    assert result.status_code == 200, result.text
    recovery = result.json()["recovery_code"]
    client.post("/tax-vault/lock", headers={"X-Tax-Session": token})
    again = client.post("/tax-vault/unlock", json={"password": password})
    assert again.status_code == 200, again.text
    assert client.get("/tax-cases", headers={"X-Tax-Session": again.json()["token"]}).json()[0]["name"] == "Altbestand"
    recovered = client.post("/tax-vault/recovery", json={"recovery_code": recovery, "password": "neues-testpasswort"})
    assert recovered.status_code == 200, recovered.text
    assert client.post("/tax-vault/unlock", json={"password": "neues-testpasswort"}).status_code == 200
    TAX_SESSIONS.clear()


def test_successful_backup_import_revokes_previous_vault_tokens(client):
    password = "backup-testpasswort"
    created = client.post("/tax-vault/setup", json={"password": password})
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    backup = client.get("/backup/export")
    assert backup.status_code == 200, backup.text
    result = client.post("/backup/import", data={"confirmation": "WIEDERHERSTELLEN"}, files={"file": ("backup.zip", backup.content, "application/zip")})
    assert result.status_code == 200, result.text
    assert client.get("/tax-cases", headers={"X-Tax-Session": token}).status_code == 423
    assert client.post("/tax-vault/unlock", json={"password": password}).status_code == 200
    TAX_SESSIONS.clear()
