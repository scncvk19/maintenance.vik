import hashlib
import io
import json
import re
import zipfile
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select

from .database import UPLOADS
from .models import RESOURCES, TaxVault

MAX_BACKUP = 250 * 1024 * 1024


def record(row):
    return {c.name: (v.isoformat() if isinstance(v := getattr(row, c.name), date) else v)
            for c in row.__table__.columns}


def export_backup(session):
    data = {name: [record(row) for row in session.scalars(select(model))]
            for name, (model, _) in RESOURCES.items()}
    vault = session.get(TaxVault, 1)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps({
            "application": "maintenance.vik", "schema_version": 1,
            "created_at": datetime.now(timezone.utc).isoformat(), "data": data,
            # This contains only salts, verifiers and encrypted key wrappers.
            # Passwords and recovery codes are never written into a backup.
            "tax_vault": record(vault) if vault else None,
        }, ensure_ascii=False))
        written = set()
        total = 0
        for doc in data["documents"]:
            if doc["storage_key"] in written:
                continue
            content = (UPLOADS / doc["storage_key"]).read_bytes()
            total += len(content)
            if total > MAX_BACKUP - 20 * 1024 * 1024:
                raise HTTPException(413, "Backup überschreitet die 250-MB-Grenze dieser Version.")
            if hashlib.sha256(content).hexdigest() != doc["sha256"]:
                raise HTTPException(409, "Eine Dokumentdatei ist beschädigt. Backup abgebrochen.")
            archive.writestr("uploads/" + doc["storage_key"], content)
            written.add(doc["storage_key"])
    if output.tell() > MAX_BACKUP:
        raise HTTPException(413, "Backup überschreitet die 250-MB-Grenze dieser Version.")
    return output.getvalue()


def validate_backup(content):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            infos = archive.infolist()
            names = [item.filename for item in infos]
            if len(names) != len(set(names)) or len(names) > 10002:
                raise ValueError("Doppelte oder zu viele ZIP-Einträge")
            if sum(item.file_size for item in infos) > MAX_BACKUP:
                raise ValueError("Entpacktes Backup ist größer als 250 MB")
            if "manifest.json" not in names:
                raise ValueError("Manifest fehlt")
            if archive.getinfo("manifest.json").file_size > 20 * 1024 * 1024:
                raise ValueError("Manifest zu groß")
            manifest = json.loads(archive.read("manifest.json"))
            if manifest.get("application") != "maintenance.vik" or manifest.get("schema_version") != 1:
                raise ValueError("Inkompatible Backup-Version")
            data = manifest["data"]
            vault = manifest.get("tax_vault")
            missing = set(RESOURCES) - set(data)
            if set(data) - set(RESOURCES) or missing - {"tax-cases", "tax-attachments"}:
                raise ValueError("Unvollständige Tabellen")
            for name in missing:
                data[name] = []
            parsed, files = {}, {}
            ids = {}
            for name, (model, schema) in RESOURCES.items():
                parsed[name] = []
                ids[name] = set()
                for row in data[name]:
                    if name == "transactions" and "component_id" not in row:
                        row = {**row, "component_id": None}
                    if set(row) != {c.name for c in model.__table__.columns}:
                        raise ValueError("Ungültige Datenfelder")
                    UUID(row["id"])
                    if row["id"] in ids[name]:
                        raise ValueError("Doppelte ID")
                    ids[name].add(row["id"])
                    clean = row.copy() if name in {"tax-cases", "tax-attachments"} else schema.model_validate({k: v for k, v in row.items() if k in schema.model_fields}).model_dump()
                    clean["id"] = row["id"]
                    if name == "assets":
                        clean["cover_document_id"] = row["cover_document_id"]
                    if name == "work-items":
                        clean["completed_date"] = date.fromisoformat(row["completed_date"]) if row["completed_date"] else None
                        if (clean["status"] == "done") != bool(clean["completed_date"]):
                            raise ValueError("Ungültiger Erledigungsstatus")
                    if name == "documents":
                        key = row["storage_key"]
                        if not re.fullmatch(r"[0-9a-f]{64}", key) or key != row["sha256"]:
                            raise ValueError("Ungültiger Dateischlüssel")
                        blob = archive.read("uploads/" + key)
                        if len(blob) != row["size"] or hashlib.sha256(blob).hexdigest() != key:
                            raise ValueError("Dateiprüfsumme stimmt nicht")
                        if not isinstance(row["filename"], str) or len(row["filename"]) > 255:
                            raise ValueError("Ungültiger Dateiname")
                        if row["analysis_status"] not in {"manual", "suggested"}:
                            raise ValueError("Unbekannter Analysestatus")
                        files[key] = blob
                        clean.update({k: row[k] for k in ("filename", "storage_key", "size", "sha256", "analysis_status")})
                    parsed[name].append(clean)
            allowed = {"manifest.json"} | {"uploads/" + key for key in files}
            if set(names) != allowed:
                raise ValueError("Unerwartete Dateien im Backup")
            components = {r["id"]: r for r in parsed["components"]}
            for name, rows in parsed.items():
                for row in rows:
                    if name in {"tax-cases", "tax-attachments"}:
                        continue
                    if name != "assets" and name != "transactions" and row["asset_id"] not in ids["assets"]:
                        raise ValueError("Asset-Verknüpfung fehlt")
                    if name == "transactions" and row.get("asset_id") and row["asset_id"] not in ids["assets"]:
                        raise ValueError("Asset-Verknüpfung fehlt")
                    if name == "assets" and row.get("cover_document_id") and row["cover_document_id"] not in ids["documents"]:
                        raise ValueError("Titelbild-Verknüpfung fehlt")
                    if name in {"work-items", "transactions"} and row.get("component_id"):
                        comp = components.get(row["component_id"])
                        if not comp or comp["asset_id"] != row.get("asset_id"):
                            raise ValueError("Komponente gehört nicht zum Asset")
            if vault is not None:
                if set(vault) != {column.name for column in TaxVault.__table__.columns} or vault.get("id") != 1:
                    raise ValueError("Ungültiger Schlüsselcontainer")
                if not all(isinstance(vault.get(field), str) for field in ("salt", "verifier", "password_wrapped_key", "recovery_salt", "recovery_verifier", "recovery_wrapped_key")):
                    raise ValueError("Ungültiger Schlüsselcontainer")
            elif parsed["tax-cases"] or parsed["tax-attachments"]:
                raise ValueError("Steuerdaten können ohne Schlüsselcontainer nicht wiederhergestellt werden")
            return parsed, files, vault
    except (ValueError, KeyError, TypeError, AttributeError, zipfile.BadZipFile, RuntimeError) as exc:
        raise HTTPException(422, f"Backup ungültig: {exc}") from exc


def restore_backup(session, parsed, files, vault):
    # Content-addressed immutable blobs are installed before the DB transaction.
    # A failed commit leaves only harmless unreferenced files, never broken references.
    for key, blob in files.items():
        destination = UPLOADS / key
        if not destination.exists():
            temporary = UPLOADS / (key + ".tmp")
            temporary.write_bytes(blob)
            temporary.replace(destination)
    try:
        for model, _ in reversed(list(RESOURCES.values())):
            session.execute(delete(model))
        session.execute(delete(TaxVault))
        for name, (model, _) in RESOURCES.items():
            session.add_all(model(**row) for row in parsed[name])
            session.flush()
        if vault:
            session.add(TaxVault(**vault))
        session.commit()
    except Exception:
        session.rollback()
        raise
