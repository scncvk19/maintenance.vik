"""WhatsApp tests never access Meta; delivery is replaced by a stub."""
from datetime import date

from app.database import Session
from app.models import Asset, NotificationRecipient, WorkItem
from app.server import app  # noqa: F401
from app import whatsapp_reminders as whatsapp


def seed(session):
    session.add(Asset(id="00000000-0000-4000-8000-000000000101", name="Privat", kind="building"))
    session.add(WorkItem(
        id="00000000-0000-4000-8000-000000000102",
        asset_id="00000000-0000-4000-8000-000000000101",
        title="Privater Termin", kind="maintenance", status="open", due_date=date.today(),
    ))
    session.add(NotificationRecipient(
        id="00000000-0000-4000-8000-000000000103",
        channel="whatsapp", label="Test", address="+41791234567", active=True,
    ))
    session.commit()


def configure(monkeypatch):
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "A" * 40)
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "123456789012345")
    monkeypatch.setenv("WHATSAPP_GRAPH_VERSION", "v99.0")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_NAME", "maintenance_reminder")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_LANGUAGE", "de")
    monkeypatch.setenv("WHATSAPP_SEND_ENABLED", "YES_I_CONFIGURED_WHATSAPP")


def test_whatsapp_is_off_by_default(client, monkeypatch, tmp_path):
    for name in ("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_SEND_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(whatsapp, "SENT_FILE", tmp_path / "sent.json")
    with Session() as session:
        seed(session)
    status = client.get("/notifications/whatsapp/status")
    assert status.status_code == 200
    assert status.json()["configured"] is False
    assert client.post("/notifications/whatsapp/send", headers={"X-Confirm-Send": "SEND_WHATSAPP"}).status_code == 503


def test_whatsapp_requires_confirmation_and_deduplicates(client, monkeypatch, tmp_path):
    configure(monkeypatch)
    monkeypatch.setattr(whatsapp, "SENT_FILE", tmp_path / "sent.json")
    outgoing = []
    monkeypatch.setattr(whatsapp, "deliver", lambda config, phone, counts: outgoing.append((config, phone, counts)))
    with Session() as session:
        seed(session)

    assert client.post("/notifications/whatsapp/send").status_code == 403
    first = client.post("/notifications/whatsapp/send", headers={"X-Confirm-Send": "SEND_WHATSAPP"})
    assert first.status_code == 200, first.text
    assert first.json()["sent"] == 1
    assert len(outgoing) == 1
    _, phone, counts = outgoing[0]
    assert phone == "+41791234567"
    assert counts["work_items"] == 1
    second = client.post("/notifications/whatsapp/send", headers={"X-Confirm-Send": "SEND_WHATSAPP"})
    assert second.status_code == 200 and second.json()["already_sent"] == 1
    assert len(outgoing) == 1
    assert "41791234567" not in whatsapp.SENT_FILE.read_text()
