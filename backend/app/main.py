import hashlib
import io
import json
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError
from sqlalchemy import case, delete, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from .backup import MAX_BACKUP, export_backup, record, restore_backup, validate_backup
from .database import Session, UPLOADS, data_lock, engine
from .integrations import INTEGRATIONS
from .auth import router as auth_router
from .models import ActivityLog, Asset, Base, Component, Contract, Document, DocumentInput, Person, RESOURCES, TaxAttachment, TaxCase, TaxVault, Transaction, TrashItem, WorkItem


TAX_SESSIONS: dict[str, tuple[bytes, datetime]] = {}
TAX_IDLE_SECONDS = 900


def tax_key(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1, dklen=32, maxmem=128 * 1024 * 1024)


def recovery_code() -> str:
    """Printable, high-entropy code that is shown once and never persisted."""
    return "-".join(secrets.token_hex(4).upper() for _ in range(6))


def tax_seal(value: object, key: bytes) -> str:
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, json.dumps(value, ensure_ascii=False).encode("utf-8"), None)
    return (nonce + ciphertext).hex()


def tax_open(value: str, key: bytes):
    raw = bytes.fromhex(value)
    return json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], None).decode("utf-8"))


def tax_session(token: str):
    entry = TAX_SESSIONS.get(token)
    if not entry:
        raise HTTPException(423, "Der Steuerbereich ist gesperrt.")
    key, expires = entry
    if expires <= datetime.now(timezone.utc):
        TAX_SESSIONS.pop(token, None)
        raise HTTPException(423, "Der Steuerbereich ist gesperrt.")
    TAX_SESSIONS[token] = (key, datetime.now(timezone.utc) + timedelta(seconds=TAX_IDLE_SECONDS))
    return key


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    existing_columns = {column["name"] for column in inspect(engine).get_columns("assets")}
    document_columns = {column["name"] for column in inspect(engine).get_columns("documents")}
    transaction_columns = {column["name"] for column in inspect(engine).get_columns("transactions")}
    recipient_columns = {column["name"] for column in inspect(engine).get_columns("notification_recipients")}
    vault_columns = {column["name"] for column in inspect(engine).get_columns("tax_vault")}
    with engine.begin() as connection:
        # Early PostgreSQL installations created the tax tables with short text
        # columns. Fresh databases already use the model definitions above.
        if connection.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE tax_cases ALTER COLUMN encrypted_payload TYPE TEXT"))
            connection.execute(text("ALTER TABLE tax_cases ALTER COLUMN created_at TYPE VARCHAR(64)"))
            connection.execute(text("ALTER TABLE tax_cases ALTER COLUMN updated_at TYPE VARCHAR(64)"))
            connection.execute(text("ALTER TABLE tax_attachments ALTER COLUMN encrypted_blob TYPE TEXT"))
            connection.execute(text("ALTER TABLE tax_attachments ALTER COLUMN created_at TYPE VARCHAR(64)"))
        for column, definition in {
            "password_wrapped_key": "TEXT DEFAULT ''",
            "recovery_salt": "VARCHAR(64) DEFAULT ''",
            "recovery_verifier": "VARCHAR(128) DEFAULT ''",
            "recovery_wrapped_key": "TEXT DEFAULT ''",
        }.items():
            if column not in vault_columns:
                connection.execute(text(f"ALTER TABLE tax_vault ADD COLUMN {column} {definition}"))
        if "contact_first_name" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN contact_first_name VARCHAR(120) DEFAULT ''"))
        if "contact_last_name" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN contact_last_name VARCHAR(120) DEFAULT ''"))
        if "contact_birth_date" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN contact_birth_date DATE"))
        if "cover_document_id" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN cover_document_id VARCHAR(36)"))
        if "tax_id" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN tax_id VARCHAR(64) DEFAULT ''"))
        if "tax_notes" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN tax_notes TEXT DEFAULT ''"))
        if "property_id" not in existing_columns:
            connection.execute(text("ALTER TABLE assets ADD COLUMN property_id VARCHAR(36)"))
        if "component_id" not in transaction_columns:
            connection.execute(text("ALTER TABLE transactions ADD COLUMN component_id VARCHAR(36)"))
        if connection.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE transactions ALTER COLUMN asset_id DROP NOT NULL"))
        if "reminder_date" not in document_columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN reminder_date DATE"))
        if "reminder_days" not in document_columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN reminder_days INTEGER DEFAULT 30"))
        for column in ("notify_contracts", "notify_documents", "notify_work_items"):
            if column not in recipient_columns:
                connection.execute(text(f"ALTER TABLE notification_recipients ADD COLUMN {column} BOOLEAN DEFAULT 1"))
    yield


app = FastAPI(title="maintenance.vik", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)


def activity_label(row, fallback: str = "") -> str:
    return str(getattr(row, "name", "") or getattr(row, "title", "") or getattr(row, "label", "") or getattr(row, "filename", "") or fallback)[:255]


def log_activity(session, action: str, resource_name: str, record_id: str, label: str = ""):
    session.add(ActivityLog(
        id=str(uuid4()), action=action, resource=resource_name, record_id=record_id,
        label=label[:255], created_at=datetime.now(timezone.utc).isoformat()
    ))


def snapshot_value(model, payload: dict):
    values = {}
    for column in model.__table__.columns:
        if column.name not in payload:
            continue
        value = payload[column.name]
        if value is not None:
            try:
                if column.type.python_type is date and isinstance(value, str):
                    value = date.fromisoformat(value)
            except (NotImplementedError, AttributeError):
                pass
        values[column.name] = value
    return model(**values)



def resource(name):
    if name not in RESOURCES:
        raise HTTPException(404, "Unbekannter Bereich")
    return RESOURCES[name]


def validate(schema, payload):
    try:
        return schema.model_validate(payload).model_dump()
    except ValidationError as exc:
        raise HTTPException(422, [{"field": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]) from exc


def check_links(session, values):
    if values.get("asset_id") and not session.get(Asset, values["asset_id"]):
        raise HTTPException(422, "Das ausgewählte Asset existiert nicht.")
    if values.get("document_id"):
        document = session.get(Document, values["document_id"])
        if not document or document.asset_id != values.get("asset_id"):
            raise HTTPException(422, "Das Dokument gehört nicht zu diesem Asset.")
    if values.get("component_id"):
        comp = session.get(Component, values["component_id"])
        if not comp or not values.get("asset_id") or comp.asset_id != values["asset_id"]:
            raise HTTPException(422, "Bereich, Raum oder Komponente gehört nicht zu diesem Asset.")
    if values.get("person_id") and not session.get(Person, values["person_id"]):
        raise HTTPException(422, "Die ausgewählte Person existiert nicht.")
    if values.get("property_id"):
        property_asset = session.get(Asset, values["property_id"])
        if not property_asset or property_asset.kind == "vehicle":
            raise HTTPException(422, "Das Fahrzeug kann nur einer Immobilie oder technischen Anlage zugeordnet werden.")
        if values.get("id") == values["property_id"]:
            raise HTTPException(422, "Ein Asset kann nicht sich selbst zugeordnet werden.")
    if values.get("end_date") and values.get("start_date") and values["end_date"] < values["start_date"]:
        raise HTTPException(422, "Das Enddatum muss nach dem Beginn liegen.")


def work_item_order(today: date | None = None):
    """Order open work by urgency, then by their planned due date."""
    priority = case(
        (WorkItem.priority.in_(("critical", "urgent")), 0),
        (WorkItem.priority == "high", 1),
        (WorkItem.priority == "normal", 2),
        else_=3,
    )
    if today:
        return (case((WorkItem.due_date < today, 0), else_=1), priority, WorkItem.due_date, WorkItem.title)
    return (priority, WorkItem.due_date, WorkItem.title)


@app.get("/health")
def health():
    with Session() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "version": "0.1.0"}


@app.get("/tax-vault/status")
def tax_vault_status():
    with data_lock, Session() as session:
        vault = session.get(TaxVault, 1)
        return {"configured": vault is not None, "recovery_ready": bool(vault and vault.recovery_wrapped_key)}


@app.post("/tax-vault/setup")
def tax_vault_setup(payload: dict):
    password = str(payload.get("password", ""))
    if len(password) < 8:
        raise HTTPException(422, "Das Steuerpasswort muss mindestens 8 Zeichen enthalten.")
    with data_lock, Session() as session:
        if session.get(TaxVault, 1):
            raise HTTPException(409, "Der Steuerbereich ist bereits eingerichtet.")
        salt = secrets.token_bytes(16)
        password_key = tax_key(password, salt)
        data_key = secrets.token_bytes(32)
        code = recovery_code()
        recovery_salt = secrets.token_bytes(16)
        recovery_key = tax_key(code, recovery_salt)
        session.add(TaxVault(
            id=1,
            salt=salt.hex(),
            verifier=hashlib.sha256(password_key).hexdigest(),
            password_wrapped_key=tax_seal({"key": data_key.hex()}, password_key),
            recovery_salt=recovery_salt.hex(),
            recovery_verifier=hashlib.sha256(recovery_key).hexdigest(),
            recovery_wrapped_key=tax_seal({"key": data_key.hex()}, recovery_key),
        ))
        session.commit()
    token = secrets.token_urlsafe(32)
    TAX_SESSIONS[token] = (data_key, datetime.now(timezone.utc) + timedelta(seconds=TAX_IDLE_SECONDS))
    return {"token": token, "expires_in": TAX_IDLE_SECONDS, "recovery_code": code}


@app.post("/tax-vault/unlock")
def tax_vault_unlock(payload: dict):
    password = str(payload.get("password", ""))
    with data_lock, Session() as session:
        vault = session.get(TaxVault, 1)
        if not vault:
            raise HTTPException(404, "Der Steuerbereich wurde noch nicht eingerichtet.")
        password_key = tax_key(password, bytes.fromhex(vault.salt))
        if not secrets.compare_digest(hashlib.sha256(password_key).hexdigest(), vault.verifier):
            raise HTTPException(401, "Das Steuerpasswort ist nicht korrekt.")
        key = tax_open(vault.password_wrapped_key, password_key)["key"] if vault.password_wrapped_key else password_key
        key = bytes.fromhex(key) if isinstance(key, str) else key
    token = secrets.token_urlsafe(32)
    TAX_SESSIONS[token] = (key, datetime.now(timezone.utc) + timedelta(seconds=TAX_IDLE_SECONDS))
    return {"token": token, "expires_in": TAX_IDLE_SECONDS}


@app.post("/tax-vault/recovery")
def tax_vault_recovery(payload: dict):
    code = str(payload.get("recovery_code", "")).strip().upper()
    password = str(payload.get("password", ""))
    if len(password) < 8:
        raise HTTPException(422, "Das neue Steuerpasswort muss mindestens 8 Zeichen enthalten.")
    with data_lock, Session() as session:
        vault = session.get(TaxVault, 1)
        if not vault or not vault.recovery_salt or not vault.recovery_wrapped_key:
            raise HTTPException(409, "Für diesen Steuerbereich ist noch kein Wiederherstellungsschlüssel hinterlegt.")
        recovery_key = tax_key(code, bytes.fromhex(vault.recovery_salt))
        if not secrets.compare_digest(hashlib.sha256(recovery_key).hexdigest(), vault.recovery_verifier):
            raise HTTPException(401, "Der Wiederherstellungsschlüssel ist nicht korrekt.")
        data_key = bytes.fromhex(tax_open(vault.recovery_wrapped_key, recovery_key)["key"])
        salt = secrets.token_bytes(16)
        password_key = tax_key(password, salt)
        vault.salt = salt.hex()
        vault.verifier = hashlib.sha256(password_key).hexdigest()
        vault.password_wrapped_key = tax_seal({"key": data_key.hex()}, password_key)
        session.commit()
    token = secrets.token_urlsafe(32)
    TAX_SESSIONS[token] = (data_key, datetime.now(timezone.utc) + timedelta(seconds=TAX_IDLE_SECONDS))
    return {"token": token, "expires_in": TAX_IDLE_SECONDS}


@app.post("/tax-vault/recovery-code")
def create_recovery_code(x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    data_key = tax_session(x_tax_session)
    with data_lock, Session() as session:
        vault = session.get(TaxVault, 1)
        if not vault:
            raise HTTPException(404, "Der Steuerbereich wurde noch nicht eingerichtet.")
        if vault.recovery_wrapped_key:
            raise HTTPException(409, "Ein Wiederherstellungsschlüssel ist bereits hinterlegt.")
        code = recovery_code()
        recovery_salt = secrets.token_bytes(16)
        recovery_key = tax_key(code, recovery_salt)
        # Legacy vaults without a wrapper derive their data key from the password.
        # Never replace an existing password-derived wrapper with a data-key wrapper.
        if not vault.password_wrapped_key:
            vault.password_wrapped_key = tax_seal({"key": data_key.hex()}, data_key)
        vault.recovery_salt = recovery_salt.hex()
        vault.recovery_verifier = hashlib.sha256(recovery_key).hexdigest()
        vault.recovery_wrapped_key = tax_seal({"key": data_key.hex()}, recovery_key)
        session.commit()
    return {"recovery_code": code}


@app.post("/tax-vault/lock")
def tax_vault_lock(x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    TAX_SESSIONS.pop(x_tax_session, None)
    return {"locked": True}


@app.post("/tax-vault/erase")
def erase_tax_vault(payload: dict):
    if str(payload.get("confirmation", "")) != "STEUERDATEN LÖSCHEN":
        raise HTTPException(422, "Bitte die Löschbestätigung exakt eingeben.")
    with data_lock, Session() as session:
        session.execute(delete(TaxAttachment))
        session.execute(delete(TaxCase))
        session.execute(delete(TaxVault))
        session.commit()
    TAX_SESSIONS.clear()
    return {"configured": False, "erased": True}


@app.post("/tax-vault/touch")
def tax_vault_touch(x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    tax_session(x_tax_session)
    return {"expires_in": TAX_IDLE_SECONDS}


def tax_case_response(session, row: TaxCase, key: bytes):
    payload = tax_open(row.encrypted_payload, key)
    if "checklists" not in payload:
        payload["checklists"] = [{"id": "unterlagen", "title": "Unterlagen-Checkliste", "items": payload.get("checklist", [])}]
    attachments = session.scalars(select(TaxAttachment).where(TaxAttachment.tax_case_id == row.id).order_by(TaxAttachment.created_at.desc())).all()
    payload["id"] = row.id
    payload["attachments"] = [{"id": item.id, "filename": item.filename, "content_type": item.content_type, "created_at": item.created_at} for item in attachments]
    return payload


@app.get("/tax-cases")
def list_tax_cases(x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    key = tax_session(x_tax_session)
    with data_lock, Session() as session:
        return [tax_case_response(session, row, key) for row in session.scalars(select(TaxCase).order_by(TaxCase.updated_at.desc()))]


@app.post("/tax-cases")
def create_tax_case(payload: dict, x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    key = tax_session(x_tax_session)
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(422, "Bitte einen Namen für den Steuerfall eingeben.")
    now = datetime.now(timezone.utc).isoformat()
    checklists = payload.get("checklists") or [{"id": "unterlagen", "title": "Unterlagen-Checkliste", "items": payload.get("checklist", [])}]
    values = {"name": name, "year": str(payload.get("year", date.today().year)), "status": str(payload.get("status", "open")), "due_date": str(payload.get("due_date", "")), "tax_id": str(payload.get("tax_id", "")), "tax_number": str(payload.get("tax_number", "")), "notes": str(payload.get("notes", "")), "checklist": payload.get("checklist", []), "checklists": checklists}
    with data_lock, Session() as session:
        row = TaxCase(id=str(uuid4()), encrypted_payload=tax_seal(values, key), created_at=now, updated_at=now)
        session.add(row)
        session.commit()
        return tax_case_response(session, row, key)


@app.put("/tax-cases/{case_id}")
def update_tax_case(case_id: str, payload: dict, x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    key = tax_session(x_tax_session)
    with data_lock, Session() as session:
        row = session.get(TaxCase, case_id)
        if not row:
            raise HTTPException(404, "Steuerfall nicht gefunden.")
        values = tax_open(row.encrypted_payload, key)
        values.update({key_name: value for key_name, value in payload.items() if key_name in {"name", "year", "status", "due_date", "tax_id", "tax_number", "notes", "checklist", "checklists"}})
        row.encrypted_payload = tax_seal(values, key)
        row.updated_at = datetime.now(timezone.utc).isoformat()
        session.commit()
        return tax_case_response(session, row, key)


@app.delete("/tax-cases/{case_id}", status_code=204)
def delete_tax_case(case_id: str, x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    tax_session(x_tax_session)
    with data_lock, Session() as session:
        row = session.get(TaxCase, case_id)
        if not row:
            raise HTTPException(404, "Steuerfall nicht gefunden.")
        session.execute(delete(TaxAttachment).where(TaxAttachment.tax_case_id == case_id))
        session.delete(row)
        session.commit()


@app.post("/tax-cases/{case_id}/attachments")
async def upload_tax_attachment(case_id: str, file: UploadFile = File(...), x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    key = tax_session(x_tax_session)
    content = await read_limited(file, 25 * 1024 * 1024)
    with data_lock, Session() as session:
        if not session.get(TaxCase, case_id):
            raise HTTPException(404, "Steuerfall nicht gefunden.")
        item = TaxAttachment(id=str(uuid4()), tax_case_id=case_id, filename=file.filename or "Upload", content_type=file.content_type or "application/octet-stream", encrypted_blob=tax_seal({"content": content.hex()}, key), created_at=datetime.now(timezone.utc).isoformat())
        session.add(item)
        session.commit()
        return {"id": item.id, "filename": item.filename, "content_type": item.content_type, "created_at": item.created_at}


@app.get("/tax-cases/{case_id}/attachments/{attachment_id}")
def download_tax_attachment(case_id: str, attachment_id: str, x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    key = tax_session(x_tax_session)
    with data_lock, Session() as session:
        item = session.get(TaxAttachment, attachment_id)
        if not item or item.tax_case_id != case_id:
            raise HTTPException(404, "Datei nicht gefunden.")
        content = bytes.fromhex(tax_open(item.encrypted_blob, key)["content"])
        return StreamingResponse(io.BytesIO(content), media_type=item.content_type, headers={"Content-Disposition": f'attachment; filename="{item.filename}"'})


@app.delete("/tax-cases/{case_id}/attachments/{attachment_id}", status_code=204)
def delete_tax_attachment(case_id: str, attachment_id: str, x_tax_session: str = Header(default="", alias="X-Tax-Session")):
    tax_session(x_tax_session)
    with data_lock, Session() as session:
        item = session.get(TaxAttachment, attachment_id)
        if not item or item.tax_case_id != case_id:
            raise HTTPException(404, "Datei nicht gefunden.")
        session.delete(item)
        session.commit()


@app.get("/dashboard")
def dashboard():
    with data_lock, Session() as session:
        today = date.today()
        month_start = today.replace(day=1)
        transactions = session.scalars(select(Transaction).where(Transaction.booked_date >= month_start, Transaction.booked_date <= today)).all()
        income = sum(t.amount_cents for t in transactions if t.direction == "income")
        expense = sum(t.amount_cents for t in transactions if t.direction == "expense")
        pending = session.scalars(select(WorkItem).where(WorkItem.status != "done").order_by(*work_item_order(today))).all()
        assets = session.scalars(select(Asset)).all()
        return {
            "income_cents": income, "expense_cents": expense, "balance_cents": income - expense,
            "asset_count": len(assets), "conditions": {key: sum(a.condition == key for a in assets) for key in ("good", "attention", "critical")},
            "overdue": sum(w.due_date < today for w in pending),
            "maintenance_due": sum(w.kind == "maintenance" and w.due_date <= today + timedelta(days=30) for w in pending),
            "upcoming": [record(w) for w in pending[:8]], "period": month_start.isoformat(),
        }


@app.get("/reminders")
def reminders():
    with data_lock, Session() as session:
        today = date.today()
        rows = [{**record(row), "reminder_type": "work_item"} for row in session.scalars(select(WorkItem).where(WorkItem.status != "done", WorkItem.due_date <= today + timedelta(days=30)).order_by(*work_item_order(today)))]
        contracts = session.scalars(select(Contract).where(Contract.end_date >= today, Contract.end_date <= today + timedelta(days=365)).order_by(Contract.end_date)).all()
        rows.extend([{**record(row), "reminder_type": "contract", "days_until_end": (row.end_date - today).days} for row in contracts if row.end_date <= today + timedelta(days=row.reminder_days)])
        documents = session.scalars(select(Document).where(Document.reminder_date >= today, Document.reminder_date <= today + timedelta(days=365)).order_by(Document.reminder_date)).all()
        rows.extend([{**record(row), "reminder_type": "document", "days_until_reminder": (row.reminder_date - today).days} for row in documents if row.reminder_date <= today + timedelta(days=row.reminder_days)])
        return rows


@app.get("/contract-reminders")
def contract_reminders():
    today = date.today()
    with data_lock, Session() as session:
        contracts = session.scalars(select(Contract).where(Contract.end_date >= today, Contract.end_date <= today + timedelta(days=365))).all()
        return [{**record(row), "days_until_end": (row.end_date - today).days} for row in contracts if row.end_date <= today + timedelta(days=row.reminder_days)]


@app.get("/integrations")
def integrations():
    return INTEGRATIONS


@app.get("/notification-recipients/{reminder_kind}")
def notification_recipients(reminder_kind: str):
    preference = {"contracts": "notify_contracts", "documents": "notify_documents", "work-items": "notify_work_items"}.get(reminder_kind)
    if not preference:
        raise HTTPException(422, "Unbekannter Erinnerungstyp")
    with data_lock, Session() as session:
        recipient_model = RESOURCES["notification-recipients"][0]
        recipients = session.scalars(
            select(recipient_model).where(
                getattr(recipient_model, "active").is_(True),
                getattr(recipient_model, preference).is_(True),
            )
        ).all()
        return [record(row) for row in recipients]


@app.get("/backup/export")
def backup_export():
    with data_lock, Session() as session:
        content = export_backup(session)
    return StreamingResponse(io.BytesIO(content), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="maintenance-vik-{date.today()}.zip"'})


async def read_limited(file, limit):
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "Datei ist zu groß.")
    return content


@app.post("/backup/preview")
async def backup_preview(file: UploadFile = File(...)):
    parsed, files, _ = validate_backup(await read_limited(file, MAX_BACKUP))
    return {"schema_version": 1, "counts": {name: len(rows) for name, rows in parsed.items()}, "files": len(files)}


@app.post("/backup/import")
async def backup_import(file: UploadFile = File(...), confirmation: str = Form(...)):
    if confirmation != "WIEDERHERSTELLEN":
        raise HTTPException(422, "Bitte Wiederherstellung ausdrücklich bestätigen.")
    parsed, files, vault = validate_backup(await read_limited(file, MAX_BACKUP))
    with data_lock, Session() as session:
        restore_backup(session, parsed, files, vault)
        # A restored vault can have a different encryption key. Expire every old token.
        TAX_SESSIONS.clear()
    return {"restored": True}


@app.post("/documents/upload", status_code=201)
async def upload(file: UploadFile = File(...), asset_id: str = Form(...), title: str = Form(...), document_date: str = Form(...), category: str = Form("other"), notes: str = Form(""), reminder_date: str = Form(""), reminder_days: str = Form("30")):
    values = validate(DocumentInput, dict(asset_id=asset_id, title=title, document_date=document_date, category=category, notes=notes, reminder_date=reminder_date or None, reminder_days=int(reminder_days or 30)))
    filename = Path((file.filename or "Dokument").replace("\\", "/")).name[:255]
    if Path(filename).suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".docx", ".xlsx"}:
        raise HTTPException(422, "Erlaubt: PDF, Bilder, TXT, CSV, DOCX und XLSX.")
    content = await read_limited(file, 25 * 1024 * 1024)
    if not content:
        raise HTTPException(422, "Die Datei ist leer.")
    key = hashlib.sha256(content).hexdigest()
    with data_lock, Session() as session:
        check_links(session, values)
        destination = UPLOADS / key
        if not destination.exists():
            destination.write_bytes(content)
        doc = Document(id=str(uuid4()), **values, filename=filename, storage_key=key, size=len(content), sha256=key, analysis_status="manual")
        session.add(doc)
        session.commit()
        return record(doc)


def document_media_type(filename: str) -> str:
    return {
        ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain", ".csv": "text/csv",
    }.get(Path(filename).suffix.lower(), "application/octet-stream")


def document_file(document_id: str) -> tuple[Document, Path]:
    with data_lock, Session() as session:
        doc = session.get(Document, document_id)
        if not doc or not (UPLOADS / doc.storage_key).is_file():
            raise HTTPException(404, "Dokument nicht gefunden")
        return doc, UPLOADS / doc.storage_key


@app.get("/documents/{document_id}/download")
def download(document_id: str):
    doc, path = document_file(document_id)
    return FileResponse(path, filename=doc.filename, media_type="application/octet-stream", headers={"X-Content-Type-Options": "nosniff"})


@app.get("/documents/{document_id}/preview")
def preview_document(document_id: str):
    doc, path = document_file(document_id)
    media_type = document_media_type(doc.filename)
    if media_type == "application/octet-stream":
        raise HTTPException(415, "Dieser Dateityp kann nicht direkt angezeigt werden. Bitte herunterladen.")
    return FileResponse(path, media_type=media_type, content_disposition_type="inline", headers={"X-Content-Type-Options": "nosniff"})


def match_asset_for_document(document: Document, assets: list[Asset]):
    source = f"{document.title} {document.filename} {document.notes}".lower()
    source_normalized = re.sub(r"[^a-z0-9äöüß]+", " ", source)
    source_tokens = {token for token in source_normalized.split() if len(token) >= 3}
    best, confidence, reasons = None, 0.0, []
    for asset in assets:
        name = asset.name.lower().strip()
        location = asset.location.lower().strip()
        score, matches = 0.0, []
        if len(name) >= 3 and name in source:
            score += 0.7
            matches.append("Objektname")
        if len(location) >= 6 and location in source:
            score += 0.95
            matches.append("Adresse")
        asset_tokens = {token for token in re.sub(r"[^a-z0-9äöüß]+", " ", f"{name} {location} {asset.contact_last_name}").split() if len(token) >= 3}
        overlap = source_tokens & asset_tokens
        if overlap:
            score += min(0.35, len(overlap) * 0.12)
            matches.append("Übereinstimmende Angaben")
        if score > confidence:
            best, confidence, reasons = asset, min(score, 1.0), matches
    return best, confidence, reasons


@app.post("/documents/{document_id}/suggest-asset")
def suggest_document_asset(document_id: str):
    with data_lock, Session() as session:
        document = session.get(Document, document_id)
        if not document:
            raise HTTPException(404, "Dokument nicht gefunden")
        asset, confidence, reasons = match_asset_for_document(document, session.scalars(select(Asset)).all())
        if asset and confidence >= 0.6:
            document.asset_id = asset.id
            document.analysis_status = "suggested"
            session.add(document)
            session.commit()
            return {"matched": True, "asset_id": asset.id, "asset_name": asset.name, "confidence": round(confidence, 2), "reasons": reasons}
        return {"matched": False, "confidence": round(confidence, 2), "reasons": reasons}


@app.post("/assets/{asset_id}/image", status_code=201)
async def upload_asset_image(asset_id: str, file: UploadFile = File(...)):
    filename = Path((file.filename or "Assetbild").replace("\\", "/")).name[:255]
    if Path(filename).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(422, "Erlaubt sind PNG, JPG und WEBP.")
    content = await read_limited(file, 10 * 1024 * 1024)
    if not content:
        raise HTTPException(422, "Die Datei ist leer.")
    key = hashlib.sha256(content).hexdigest()
    with data_lock, Session() as session:
        asset = session.get(Asset, asset_id)
        if not asset:
            raise HTTPException(404, "Asset nicht gefunden")
        destination = UPLOADS / key
        if not destination.exists():
            destination.write_bytes(content)
        document = Document(id=str(uuid4()), asset_id=asset.id, title=f"Bild: {asset.name}", category="other", document_date=date.today(), notes="Titelbild für das Asset", filename=filename, storage_key=key, size=len(content), sha256=key, analysis_status="manual")
        session.add(document)
        session.flush()
        asset.cover_document_id = document.id
        session.add(asset)
        session.commit()
        return record(asset)


@app.get("/assets/{asset_id}/image")
def asset_image(asset_id: str):
    with data_lock, Session() as session:
        asset = session.get(Asset, asset_id)
        if not asset or not asset.cover_document_id:
            raise HTTPException(404, "Kein Bild hinterlegt")
        document = session.get(Document, asset.cover_document_id)
        if not document or document.asset_id != asset.id or not (UPLOADS / document.storage_key).is_file():
            raise HTTPException(404, "Bild nicht gefunden")
        suffix = Path(document.filename).suffix.lower()
        media_type = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(suffix, "application/octet-stream")
        return FileResponse(UPLOADS / document.storage_key, media_type=media_type, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


@app.get("/records/{name}")
def list_records(name: str):
    model, _ = resource(name)
    with data_lock, Session() as session:
        statement = select(model)
        if name == "work-items":
            statement = statement.order_by(*work_item_order())
        return [record(row) for row in session.scalars(statement)]


def asset_dependencies(session, asset_id: str):
    return {
        "components": [record(row) for row in session.scalars(select(Component).where(Component.asset_id == asset_id))],
        "work_items": [record(row) for row in session.scalars(select(WorkItem).where(WorkItem.asset_id == asset_id))],
        "transactions": [record(row) for row in session.scalars(select(Transaction).where(Transaction.asset_id == asset_id))],
        "documents": [record(row) for row in session.scalars(select(Document).where(Document.asset_id == asset_id))],
        "contracts": [record(row) for row in session.scalars(select(Contract).where(Contract.asset_id == asset_id))],
    }


@app.get("/records/assets/{record_id}/dependencies")
def list_asset_dependencies(record_id: str):
    with data_lock, Session() as session:
        if not session.get(Asset, record_id):
            raise HTTPException(404, "Asset nicht gefunden")
        dependencies = asset_dependencies(session, record_id)
        return {"total": sum(len(items) for items in dependencies.values()), "groups": dependencies}


def save_record(name, payload, record_id=None):
    model, schema = resource(name)
    if name == "documents" and not record_id:
        raise HTTPException(405, "Bitte Dokument-Upload verwenden")
    values = validate(schema, payload)
    if name == "assets" and record_id:
        values["id"] = record_id
    if name == "contracts" and values["end_date"] < values["start_date"]:
        raise HTTPException(422, "Das Vertragsende muss nach dem Vertragsbeginn liegen.")
    with data_lock, Session() as session:
        check_links(session, values)
        row = session.get(model, record_id) if record_id else model(id=str(uuid4()))
        if row is None:
            raise HTTPException(404, "Eintrag nicht gefunden")
        was_done = name == "work-items" and row.status == "done"
        if name == "work-items" and was_done and values["status"] != "done":
            raise HTTPException(409, "Erledigte Historieneinträge können nicht wieder geöffnet werden. Bitte neue Aufgabe anlegen.")
        if name == "components" and record_id and row.asset_id != values["asset_id"]:
            linked = session.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.component_id == record_id))
            if linked:
                raise HTTPException(409, "Verknüpfte Komponenten können nicht zu einem anderen Asset verschoben werden.")
        for key, value in values.items():
            if key == "id":
                continue
            setattr(row, key, value)
        if name == "work-items" and values["status"] == "done" and not was_done:
            row.completed_date = date.today()
            if row.kind in ("maintenance", "tax_return") and row.interval_days:
                follow_up = values | {"status": "open", "due_date": max(row.due_date, date.today()) + timedelta(days=row.interval_days)}
                session.add(WorkItem(id=str(uuid4()), **follow_up))
        session.add(row)
        log_activity(session, "updated" if record_id else "created", name, row.id, activity_label(row, name))
        session.commit()
        return record(row)


@app.post("/records/{name}", status_code=201)
def create(name: str, payload: dict):
    return save_record(name, payload)


@app.put("/records/{name}/{record_id}")
def update(name: str, record_id: str, payload: dict):
    return save_record(name, payload, record_id)


@app.delete("/records/{name}/{record_id}", status_code=204)
def remove(name: str, record_id: str, cascade: bool = Query(False)):
    model, _ = resource(name)
    with data_lock, Session() as session:
        row = session.get(model, record_id)
        if not row:
            raise HTTPException(404, "Eintrag nicht gefunden")
        label = activity_label(row, name)
        if name == "assets" and cascade:
            dependencies = asset_dependencies(session, record_id)
            snapshot = {"record": record(row), "groups": dependencies}
            session.add(TrashItem(
                id=str(uuid4()), resource=name, record_id=record_id, label=label,
                payload=json.dumps(snapshot, ensure_ascii=False), deleted_at=datetime.now(timezone.utc).isoformat()
            ))
            for dependent_model in (Contract, Document, Transaction, WorkItem, Component):
                session.execute(delete(dependent_model).where(dependent_model.asset_id == record_id))
            session.delete(row)
            log_activity(session, "deleted", name, record_id, label)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                raise HTTPException(409, "Verknüpfungen konnten nicht vollständig entfernt werden.") from exc
            return
        snapshot = {"record": record(row)}
        if name == "documents":
            snapshot["cover_asset_ids"] = [asset.id for asset in session.scalars(select(Asset).where(Asset.cover_document_id == record_id))]
            for asset in session.scalars(select(Asset).where(Asset.cover_document_id == record_id)):
                asset.cover_document_id = None
                session.add(asset)
        session.add(TrashItem(
            id=str(uuid4()), resource=name, record_id=record_id, label=label,
            payload=json.dumps(snapshot, ensure_ascii=False), deleted_at=datetime.now(timezone.utc).isoformat()
        ))
        session.delete(row)
        log_activity(session, "deleted", name, record_id, label)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            if name == "assets":
                dependencies = asset_dependencies(session, record_id)
                raise HTTPException(409, {"message": "Es bestehen Verknüpfungen.", "dependencies": dependencies}) from exc
            raise HTTPException(409, "Es bestehen Verknüpfungen. Bitte zuerst die zugeordneten Einträge entfernen.") from exc


@app.get("/trash")
def list_trash():
    with data_lock, Session() as session:
        items = session.scalars(select(TrashItem).order_by(TrashItem.deleted_at.desc())).all()
        return [{"id": item.id, "resource": item.resource, "record_id": item.record_id, "label": item.label, "deleted_at": item.deleted_at} for item in items]


@app.post("/trash/{trash_id}/restore")
def restore_trash(trash_id: str):
    with data_lock, Session() as session:
        item = session.get(TrashItem, trash_id)
        if not item:
            raise HTTPException(404, "Papierkorb-Eintrag nicht gefunden")
        snapshot = json.loads(item.payload)
        model, _ = resource(item.resource)
        if session.get(model, item.record_id):
            raise HTTPException(409, "Ein Eintrag mit derselben ID existiert bereits.")
        try:
            if item.resource == "assets" and "groups" in snapshot:
                session.add(snapshot_value(Asset, snapshot["record"]))
                groups = snapshot["groups"]
                restore_order = [
                    ("components", Component), ("documents", Document), ("work_items", WorkItem),
                    ("transactions", Transaction), ("contracts", Contract),
                ]
                for group, group_model in restore_order:
                    for row_data in groups.get(group, []):
                        session.add(snapshot_value(group_model, row_data))
            else:
                session.add(snapshot_value(model, snapshot["record"]))
                if item.resource == "documents":
                    for asset_id in snapshot.get("cover_asset_ids", []):
                        asset = session.get(Asset, asset_id)
                        if asset:
                            asset.cover_document_id = item.record_id
                            session.add(asset)
            session.delete(item)
            log_activity(session, "restored", item.resource, item.record_id, item.label)
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(409, "Wiederherstellung nicht möglich, weil benötigte Verknüpfungen fehlen.") from exc
        return {"restored": True}


@app.delete("/trash/{trash_id}", status_code=204)
def purge_trash(trash_id: str):
    with data_lock, Session() as session:
        item = session.get(TrashItem, trash_id)
        if not item:
            raise HTTPException(404, "Papierkorb-Eintrag nicht gefunden")
        snapshot = json.loads(item.payload)
        keys = []
        if item.resource == "documents":
            keys.append(snapshot.get("record", {}).get("storage_key"))
        if item.resource == "assets":
            keys.extend(row.get("storage_key") for row in snapshot.get("groups", {}).get("documents", []))
        session.delete(item)
        log_activity(session, "purged", item.resource, item.record_id, item.label)
        session.commit()
        for key in {key for key in keys if key}:
            if not session.scalar(select(func.count()).select_from(Document).where(Document.storage_key == key)):
                if not any(key in trash.payload for trash in session.scalars(select(TrashItem))):
                    (UPLOADS / key).unlink(missing_ok=True)


@app.get("/activity")
def list_activity(limit: int = Query(100, ge=1, le=500)):
    with data_lock, Session() as session:
        rows = session.scalars(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit)).all()
        return [{"id": row.id, "action": row.action, "resource": row.resource, "record_id": row.record_id, "label": row.label, "created_at": row.created_at} for row in rows]


@app.post("/seed", status_code=201)
def seed():
    with data_lock, Session() as session:
        if session.scalar(select(func.count()).select_from(Asset)):
            raise HTTPException(409, "Beispieldaten sind nur bei leerem Bestand möglich.")
        today = date.today()
        assets = [Asset(id=str(uuid4()), name=name, kind=kind, location=location, condition=condition, notes="Beispieldatensatz – bitte durch eigene Angaben ersetzen.") for name, kind, location, condition in [
            ("Wohnhaus am Park", "building", "Musterstraße 12", "good"),
            ("Servicefahrzeug", "vehicle", "Garage / Stellplatz 2", "attention"),
            ("Heizungsanlage", "equipment", "Technikraum", "good"),
        ]]
        session.add_all(assets)
        session.flush()
        session.add(Component(id=str(uuid4()), asset_id=assets[0].id, name="Erdgeschoss", kind="area"))
        for i, (title, kind, offset) in enumerate([("Heizung prüfen", "maintenance", 7), ("Reifendruck kontrollieren", "task", -2), ("Jährlicher Service", "maintenance", 14)]):
            session.add(WorkItem(id=str(uuid4()), asset_id=assets[i].id, title=title, kind=kind, due_date=today + timedelta(days=offset), interval_days=365 if kind == "maintenance" else None))
        session.add_all([
            Transaction(id=str(uuid4()), asset_id=assets[0].id, title="Beispiel: Miete", direction="income", amount_cents=145000, booked_date=today, category="rent"),
            Transaction(id=str(uuid4()), asset_id=assets[2].id, title="Beispiel: Energie", direction="expense", amount_cents=28500, booked_date=today, category="energy"),
        ])
        session.commit()
    return {"created": True}
