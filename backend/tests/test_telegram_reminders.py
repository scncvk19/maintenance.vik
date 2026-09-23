"""All tests use isolated SQLite; Telegram network calls are replaced by a stub."""
from datetime import date

from fastapi.testclient import TestClient

from app.database import Session
from app.models import Asset, NotificationRecipient, WorkItem
from app.server import app
from app import telegram_reminders as reminders


def test_preview_does_not_send(client, monkeypatch, tmp_path):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_SEND_ENABLED", raising=False)
    monkeypatch.setattr(reminders, "SENT_FILE", tmp_path / "sent.json")
    monkeypatch.setattr(reminders, "SETTINGS_FILE", tmp_path / "telegram-settings.json")
    monkeypatch.setattr(reminders, "deliver", lambda *_: (_ for _ in ()).throw(AssertionError("Must not send")))
    with Session() as session:
        session.add(Asset(id="00000000-0000-4000-8000-000000000001", name="Geheimadresse", kind="building"))
        session.add(WorkItem(id="00000000-0000-4000-8000-000000000002", asset_id="00000000-0000-4000-8000-000000000001", title="Privater Wartungstermin", kind="maintenance", status="open", due_date=date.today()))
        session.add(NotificationRecipient(id="00000000-0000-4000-8000-000000000003", channel="telegram", label="Test", address="1234567890", active=True))
        session.commit()
    response = client.get("/notifications/preview")
    assert response.status_code == 200
    assert response.json()["counts"]["work_items"] == 1
    assert response.json()["configured"] is False
    assert "Geheimadresse" not in response.text and "Privater Wartungstermin" not in response.text
    assert client.post("/notifications/telegram/send", headers={"X-Confirm-Send": "SEND_TELEGRAM"}).status_code == 503
    assert not reminders.SENT_FILE.exists()


def test_delivery_requires_confirmation_and_is_deduplicated(client, monkeypatch, tmp_path):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:" + "A" * 35)
    monkeypatch.setenv("TELEGRAM_SEND_ENABLED", "YES_I_CONFIGURED_THE_BOT")
    monkeypatch.setattr(reminders, "SENT_FILE", tmp_path / "sent.json")
    outgoing = []
    monkeypatch.setattr(reminders, "deliver", lambda token, chat, text: outgoing.append((token, chat, text)))
    with Session() as session:
        session.add(Asset(id="00000000-0000-4000-8000-000000000011", name="Meine Adresse", kind="building"))
        session.add(WorkItem(id="00000000-0000-4000-8000-000000000012", asset_id="00000000-0000-4000-8000-000000000011", title="Privater Termin", kind="maintenance", status="open", due_date=date.today()))
        session.add(NotificationRecipient(id="00000000-0000-4000-8000-000000000013", channel="telegram", label="Test", address="1234567890", active=True))
        session.commit()
    assert client.post("/notifications/telegram/send").status_code == 403
    headers = {"X-Confirm-Send": "SEND_TELEGRAM"}
    first = client.post("/notifications/telegram/send", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["sent"] == 1
    assert len(outgoing) == 1
    assert "Privater Termin" not in outgoing[0][2] and "Meine Adresse" not in outgoing[0][2]
    second = client.post("/notifications/telegram/send", headers=headers)
    assert second.status_code == 200 and second.json()["already_sent"] == 1
    assert len(outgoing) == 1
    assert "1234567890" not in reminders.SENT_FILE.read_text()


def test_ui_settings_are_encrypted_and_can_override_environment(client, monkeypatch, tmp_path):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "12345:" + "A" * 35)
    monkeypatch.setenv("TELEGRAM_SEND_ENABLED", "YES_I_CONFIGURED_THE_BOT")
    monkeypatch.setattr(reminders, "SETTINGS_FILE", tmp_path / "telegram-settings.json")

    before = client.get("/notifications/telegram/settings")
    assert before.status_code == 200
    assert before.json()["source"] == "env"
    assert before.json()["token_configured"] is True

    new_token = "67890:" + "B" * 35
    saved = client.put("/notifications/telegram/settings", json={
        "token": new_token, "enabled": True, "interval_seconds": 1800
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["source"] == "ui"
    assert saved.json()["enabled"] is True
    assert saved.json()["interval_seconds"] == 1800
    assert new_token not in reminders.SETTINGS_FILE.read_text(encoding="utf-8")

    effective = reminders.effective_settings()
    assert effective["token"] == new_token
    assert effective["enabled"] is True

    config = client.get("/notifications/telegram/worker-config")
    assert config.status_code == 200
    assert config.json() == {"enabled": True, "interval_seconds": 1800}


def test_connection_test_never_returns_token(client, monkeypatch, tmp_path):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.setattr(reminders, "SETTINGS_FILE", tmp_path / "telegram-settings.json")
    token = "12345:" + "C" * 35
    monkeypatch.setattr(reminders, "_telegram_get_me", lambda value: {"username": "maintenance_test_bot"} if value == token else {})
    response = client.post("/notifications/telegram/test", json={"token": token})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "bot_username": "maintenance_test_bot"}
    assert token not in response.text
