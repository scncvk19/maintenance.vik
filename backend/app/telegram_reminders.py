"""Privacy-minimal Telegram reminders: off by default; no tax contents or titles leave the server."""
import base64
import hashlib
import json
import os
import re
import secrets
import tempfile
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from .database import DATA_DIR, Session, data_lock
from .models import Contract, Document, NotificationRecipient, WorkItem

router = APIRouter(prefix="/notifications", tags=["notifications"])
SENT_FILE = DATA_DIR / "telegram-sent.json"
SETTINGS_FILE = DATA_DIR / "telegram-settings.json"
SETTINGS_KEY_FILE = DATA_DIR / ".telegram-settings.key"
TOKEN_PATTERN = re.compile(r"^[0-9]{5,15}:[A-Za-z0-9_-]{30,}$")
CHAT_PATTERN = re.compile(r"^-?[0-9]{5,20}$")



def _settings_key() -> bytes:
    if SETTINGS_KEY_FILE.exists():
        try:
            key = base64.urlsafe_b64decode(SETTINGS_KEY_FILE.read_text(encoding="ascii"))
            if len(key) == 32:
                return key
        except Exception:
            pass
        raise HTTPException(503, "Telegram-Konfigurationsschlüssel ist beschädigt.")
    key = secrets.token_bytes(32)
    temp = SETTINGS_KEY_FILE.with_suffix(".tmp")
    temp.write_text(base64.urlsafe_b64encode(key).decode("ascii"), encoding="ascii")
    os.chmod(temp, 0o600)
    os.replace(temp, SETTINGS_KEY_FILE)
    return key


def _load_stored_settings() -> dict | None:
    if not SETTINGS_FILE.exists():
        return None
    try:
        payload = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        nonce = base64.b64decode(payload["nonce"])
        ciphertext = base64.b64decode(payload["ciphertext"])
        raw = AESGCM(_settings_key()).decrypt(nonce, ciphertext, b"maintenance.vik.telegram.v1")
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError
        return data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Telegram-Konfiguration kann nicht gelesen werden.") from exc


def _save_settings(data: dict) -> None:
    nonce = secrets.token_bytes(12)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(_settings_key()).encrypt(nonce, raw, b"maintenance.vik.telegram.v1")
    payload = {"version": 1, "nonce": base64.b64encode(nonce).decode("ascii"), "ciphertext": base64.b64encode(ciphertext).decode("ascii")}
    temp = SETTINGS_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(payload), encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, SETTINGS_FILE)


def effective_settings() -> dict:
    stored = _load_stored_settings()
    if stored is not None:
        token = str(stored.get("token", ""))
        return {
            "token": token,
            "enabled": bool(stored.get("enabled", False)),
            "interval_seconds": max(300, int(stored.get("interval_seconds", 3600))),
            "source": "ui",
        }
    try:
        interval = max(300, int(os.getenv("TELEGRAM_CHECK_INTERVAL_SECONDS", "3600")))
    except ValueError:
        interval = 3600
    return {
        "token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
        "enabled": os.getenv("TELEGRAM_SEND_ENABLED") == "YES_I_CONFIGURED_THE_BOT",
        "interval_seconds": interval,
        "source": "env",
    }


def _telegram_get_me(token: str) -> dict:
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/getMe", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read(4096))
        if result.get("ok") is not True:
            raise ValueError
        return result.get("result") or {}
    except Exception as exc:
        raise HTTPException(502, "Telegram-Verbindung fehlgeschlagen. Bot-Token prüfen.") from exc


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
        "configured": (lambda settings: settings["enabled"] and bool(TOKEN_PATTERN.fullmatch(settings["token"])))(effective_settings()),
        "message": compose_message(counts),
        "note": "Nur Anzahlen; kein Versand ohne ausdrückliche Freigabe.",
    }


@router.get("/telegram/settings")
def telegram_settings():
    settings = effective_settings()
    return {
        "enabled": settings["enabled"],
        "interval_seconds": settings["interval_seconds"],
        "token_configured": bool(TOKEN_PATTERN.fullmatch(settings["token"])),
        "token_masked": "••••••••••••" if settings["token"] else "",
        "source": settings["source"],
    }


@router.put("/telegram/settings")
def update_telegram_settings(payload: dict):
    current = effective_settings()
    token = str(payload.get("token") or current["token"]).strip()
    enabled = bool(payload.get("enabled", False))
    try:
        interval = int(payload.get("interval_seconds", current["interval_seconds"]))
    except (TypeError, ValueError):
        raise HTTPException(422, "Ungültiges Prüfintervall.")
    if interval < 300 or interval > 86400:
        raise HTTPException(422, "Prüfintervall muss zwischen 5 Minuten und 24 Stunden liegen.")
    if token and not TOKEN_PATTERN.fullmatch(token):
        raise HTTPException(422, "Bot-Token hat kein gültiges Telegram-Format.")
    if enabled and not token:
        raise HTTPException(422, "Zum Aktivieren wird ein Bot-Token benötigt.")
    _save_settings({"token": token, "enabled": enabled, "interval_seconds": interval})
    return telegram_settings()


@router.post("/telegram/test")
def test_telegram_connection(payload: dict | None = None):
    current = effective_settings()
    candidate = str((payload or {}).get("token") or current["token"]).strip()
    if not TOKEN_PATTERN.fullmatch(candidate):
        raise HTTPException(422, "Bitte zuerst einen gültigen Bot-Token eingeben.")
    bot = _telegram_get_me(candidate)
    username = str(bot.get("username") or "")
    return {"ok": True, "bot_username": username}


@router.get("/telegram/worker-config")
def telegram_worker_config():
    settings = effective_settings()
    return {
        "enabled": settings["enabled"] and bool(TOKEN_PATTERN.fullmatch(settings["token"])),
        "interval_seconds": settings["interval_seconds"],
    }


@router.post("/telegram/send")
def send_reminders(x_confirm_send: str = Header(default="", alias="X-Confirm-Send")):
    if x_confirm_send != "SEND_TELEGRAM":
        raise HTTPException(403, "Versand muss ausdrücklich bestätigt werden.")
    settings = effective_settings()
    token = settings["token"]
    if not settings["enabled"] or not TOKEN_PATTERN.fullmatch(token):
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
