"""Optional WhatsApp Cloud API reminder delivery using an approved template.

Off by default. Only three reminder counts are sent as template parameters.
No titles, addresses, amounts, document text, tax data, or asset names leave the app.
"""
import hashlib
import json
import os
import re
import tempfile
import urllib.request
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from .database import DATA_DIR, Session, data_lock
from .models import NotificationRecipient
from .telegram_reminders import due_counts

router = APIRouter(prefix="/notifications", tags=["notifications"])
SENT_FILE = DATA_DIR / "whatsapp-sent.json"
PHONE_PATTERN = re.compile(r"^\+?[1-9][0-9]{7,14}$")
VERSION_PATTERN = re.compile(r"^v[0-9]{1,3}\.[0-9]{1,3}$")
ID_PATTERN = re.compile(r"^[0-9]{5,30}$")
TEMPLATE_PATTERN = re.compile(r"^[a-z0-9_]{1,512}$")
LANGUAGE_PATTERN = re.compile(r"^[A-Za-z]{2,3}(?:_[A-Za-z]{2})?$")


def config():
    return {
        "token": os.getenv("WHATSAPP_ACCESS_TOKEN", ""),
        "phone_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID", ""),
        "version": os.getenv("WHATSAPP_GRAPH_VERSION", ""),
        "template": os.getenv("WHATSAPP_TEMPLATE_NAME", ""),
        "language": os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "de"),
        "enabled": os.getenv("WHATSAPP_SEND_ENABLED") == "YES_I_CONFIGURED_WHATSAPP",
    }


def is_configured(values=None):
    values = values or config()
    return (
        values["enabled"]
        and len(values["token"]) >= 20
        and bool(ID_PATTERN.fullmatch(values["phone_id"]))
        and bool(VERSION_PATTERN.fullmatch(values["version"]))
        and bool(TEMPLATE_PATTERN.fullmatch(values["template"]))
        and bool(LANGUAGE_PATTERN.fullmatch(values["language"]))
    )


def load_sent() -> set[str]:
    if not SENT_FILE.exists():
        return set()
    try:
        values = json.loads(SENT_FILE.read_text(encoding="utf-8"))
        if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
            raise ValueError("Ungültiges Versandprotokoll")
        return set(values)
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "WhatsApp-Versandprotokoll kann nicht gelesen werden; kein Versand.") from exc


def persist_sent(values: set[str]) -> None:
    path = None
    try:
        fd, name = tempfile.mkstemp(prefix=".whatsapp-sent-", dir=DATA_DIR)
        path = Path(name)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(sorted(values), stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(path, 0o600)
        os.replace(path, SENT_FILE)
    except OSError as exc:
        raise HTTPException(503, "WhatsApp-Versandprotokoll kann nicht gespeichert werden.") from exc
    finally:
        if path is not None:
            path.unlink(missing_ok=True)


def deliver(values: dict[str, str | bool], recipient: str, counts: dict[str, int]) -> None:
    to = recipient.lstrip("+")
    payload = json.dumps({
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": values["template"],
            "language": {"code": values["language"]},
            "components": [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(counts["work_items"])},
                    {"type": "text", "text": str(counts["contracts"])},
                    {"type": "text", "text": str(counts["documents"])},
                ],
            }],
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"https://graph.facebook.com/{values['version']}/{values['phone_id']}/messages",
        data=payload,
        headers={
            "Authorization": f"Bearer {values['token']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read(8192))
        if not result.get("messages") or not result["messages"][0].get("id"):
            raise ValueError("Keine Nachrichten-ID")
    except Exception as exc:
        raise HTTPException(502, "WhatsApp-Versand fehlgeschlagen. Cloud-API-Konfiguration und Template prüfen.") from exc


@router.get("/whatsapp/status")
def whatsapp_status():
    values = config()
    with data_lock, Session() as session:
        counts = due_counts(session, date.today())
        recipients = sum(
            1 for row in session.scalars(select(NotificationRecipient))
            if row.channel == "whatsapp" and row.active
        )
    return {
        "configured": is_configured(values),
        "recipients": recipients,
        "counts": counts,
        "template": values["template"] if values["template"] else None,
        "note": "Nur Anzahlen werden als Template-Parameter übertragen.",
    }


@router.post("/whatsapp/send")
def send_whatsapp(x_confirm_send: str = Header(default="", alias="X-Confirm-Send")):
    if x_confirm_send != "SEND_WHATSAPP":
        raise HTTPException(403, "Versand muss ausdrücklich bestätigt werden.")
    values = config()
    if not is_configured(values):
        raise HTTPException(503, "WhatsApp Cloud API ist nicht vollständig aktiviert.")

    with data_lock, Session() as session:
        counts = due_counts(session, date.today())
        recipients = [
            row for row in session.scalars(select(NotificationRecipient))
            if row.channel == "whatsapp" and row.active
        ]
        if not recipients:
            raise HTTPException(409, "Kein aktiver WhatsApp-Empfänger eingerichtet.")
        if not any(counts.values()):
            return {"sent": 0, "already_sent": 0, "due": counts}

        sent = load_sent()
        delivered = duplicate = 0
        for recipient in recipients:
            if not PHONE_PATTERN.fullmatch(recipient.address):
                raise HTTPException(422, "Ungültige WhatsApp-Rufnummer; kein weiterer Versand.")
            filtered = {
                "work_items": counts["work_items"] if recipient.notify_work_items else 0,
                "contracts": counts["contracts"] if recipient.notify_contracts else 0,
                "documents": counts["documents"] if recipient.notify_documents else 0,
            }
            if not any(filtered.values()):
                continue
            key = hashlib.sha256(f"{date.today().isoformat()}:{recipient.address}".encode()).hexdigest()
            if key in sent:
                duplicate += 1
                continue
            deliver(values, recipient.address, filtered)
            sent.add(key)
            persist_sent(sent)
            delivered += 1
        return {"sent": delivered, "already_sent": duplicate, "due": counts}
