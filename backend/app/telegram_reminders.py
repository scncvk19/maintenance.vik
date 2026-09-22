"""Privacy-minimal Telegram reminders: off by default; no tax contents or titles leave the server."""
import hashlib
import json
import os
import re
import tempfile
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from .database import DATA_DIR, Session, data_lock
from .models import Contract, Document, NotificationRecipient, WorkItem

router = APIRouter(prefix="/notifications", tags=["notifications"])
SENT_FILE = DATA_DIR / "telegram-sent.json"
TOKEN_PATTERN = re.compile(r"^[0-9]{5,15}:[A-Za-z0-9_-]{30,}$")
CHAT_PATTERN = re.compile(r"^-?[0-9]{5,20}$")


def due_counts(session, today: date) -> dict[str, int]:
    """Only counts, never private names, addresses, amounts or tax-case data."""
    work = sum(1 for row in session.scalars(select(WorkItem))
               if row.status != "done" and row.due_date <= today + timedelta(days=7))
    contracts = sum(1 for row in session.scalars(select(Contract))
                    if row.end_date <= today + timedelta(days=row.reminder_days))
    documents = sum(1 for row in session.scalars(select(Document))
                    if row.reminder_date is not None and row.reminder_date <= today)
    return {"work_items": work, "contracts": contracts, "documents": documents}


def compose_message(counts: dict[str, int]) -> str:
    return ("maintenance.vik – Erinnerungen\n"
            f"Aufgaben/Wartungen: {counts['work_items']}\n"
            f"Vertragsenden: {counts['contracts']}\n"
            f"Dokument-Erinnerungen: {counts['documents']}\n"
            "Details ausschließlich in der lokalen Anwendung öffnen.")


def load_sent() -> set[str]:
    if not SENT_FILE.exists():
        return set()
    try:
        values = json.loads(SENT_FILE.read_text(encoding="utf-8"))
        if not isinstance(values, list) or any(not isinstance(v, str) for v in values):
            raise ValueError("Ungültiges Versandprotokoll")
        return set(values)
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Versandprotokoll kann nicht gelesen werden; kein Versand.") from exc


def persist_sent(values: set[str]) -> None:
    """Atomic replacement; a failed write stops further sends rather than risking duplicates."""
    path = None
    try:
        fd, name = tempfile.mkstemp(prefix=".telegram-sent-", dir=DATA_DIR)
        path = Path(name)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(sorted(values), stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(path, 0o600)
        os.replace(path, SENT_FILE)
    except OSError as exc:
        raise HTTPException(503, "Versandprotokoll kann nicht gespeichert werden.") from exc
    finally:
        if path is not None:
            path.unlink(missing_ok=True)


def deliver(token: str, chat_id: str, message: str) -> None:
    payload = json.dumps({"chat_id": chat_id, "text": message, "disable_web_page_preview": True}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read(4096))
        if result.get("ok") is not True:
            raise ValueError("Telegram lieferte keine Bestätigung")
    except Exception as exc:
        # Never leak bot token, chat ID, request URL or personal content to the UI.
        raise HTTPException(502, "Telegram-Versand fehlgeschlagen. Bot und Chat-ID prüfen.") from exc


@router.get("/preview")
def preview_reminders():
    with data_lock, Session() as session:
        counts = due_counts(session, date.today())
        recipients = sum(1 for row in session.scalars(select(NotificationRecipient))
                         if row.channel == "telegram" and row.active)
    return {
        "counts": counts, "telegram_recipients": recipients,
        "configured": bool(os.getenv("TELEGRAM_BOT_TOKEN")) and os.getenv("TELEGRAM_SEND_ENABLED") == "YES_I_CONFIGURED_THE_BOT",
        "message": compose_message(counts),
        "note": "Nur Anzahlen; kein Versand ohne ausdrückliche Freigabe.",
    }


@router.post("/telegram/send")
def send_reminders(x_confirm_send: str = Header(default="", alias="X-Confirm-Send")):
    if x_confirm_send != "SEND_TELEGRAM":
        raise HTTPException(403, "Versand muss ausdrücklich bestätigt werden.")
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if os.getenv("TELEGRAM_SEND_ENABLED") != "YES_I_CONFIGURED_THE_BOT" or not TOKEN_PATTERN.fullmatch(token):
        raise HTTPException(503, "Telegram ist nicht vollständig aktiviert.")
    with data_lock, Session() as session:
        counts = due_counts(session, date.today())
        recipients = [row for row in session.scalars(select(NotificationRecipient))
                      if row.channel == "telegram" and row.active]
        if not recipients:
            raise HTTPException(409, "Kein aktiver Telegram-Empfänger eingerichtet.")
        if not any(counts.values()):
            return {"sent": 0, "already_sent": 0, "due": counts}
        sent = load_sent()
        delivered = duplicate = 0
        for recipient in recipients:
            if not CHAT_PATTERN.fullmatch(recipient.address):
                raise HTTPException(422, "Ungültige Telegram-Chat-ID; kein weiterer Versand.")
            filtered = {
                "work_items": counts["work_items"] if recipient.notify_work_items else 0,
                "contracts": counts["contracts"] if recipient.notify_contracts else 0,
                "documents": counts["documents"] if recipient.notify_documents else 0,
            }
            if not any(filtered.values()):
                continue
            # Hash the chat ID so it is never stored in the deduplication file.
            key = hashlib.sha256(f"{date.today().isoformat()}:{recipient.address}".encode()).hexdigest()
            if key in sent:
                duplicate += 1
                continue
            deliver(token, recipient.address, compose_message(filtered))
            sent.add(key)
            persist_sent(sent)
            delivered += 1
        return {"sent": delivered, "already_sent": duplicate, "due": counts}
