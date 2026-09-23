import io
import json
import zipfile
from datetime import date, timedelta


def asset(client, kind="building"):
    response = client.post("/records/assets", json={"name": "Testbestand", "kind": kind})
    assert response.status_code == 201, response.text
    return response.json()


def work(asset_id, **kwargs):
    return {"asset_id": asset_id, "title": "Inspektion", "kind": "maintenance", "due_date": str(date.today() - timedelta(days=1)), "interval_days": 30} | kwargs


def test_all_asset_types_and_relationship_protection(client):
    for kind in ("building", "vehicle", "equipment", "property"):
        a = asset(client, kind)
        component = client.post("/records/components", json={"asset_id": a["id"], "name": "Bereich"})
        assert component.status_code == 201
        assert client.delete(f'/records/assets/{a["id"]}').status_code == 409
    assert client.post("/records/assets", json={"name": " ", "kind": "building"}).status_code == 422


def test_asset_contact_person_is_optional_and_persisted(client):
    response = client.post("/records/assets", json={"name": "Mehrfamilienhaus", "kind": "building", "contact_first_name": "Mara", "contact_last_name": "Beispiel", "contact_birth_date": "1985-04-12"})
    assert response.status_code == 201, response.text
    saved = client.get("/records/assets").json()[0]
    assert saved["contact_first_name"] == "Mara"
    assert saved["contact_last_name"] == "Beispiel"
    assert saved["contact_birth_date"] == "1985-04-12"
    assert client.post("/records/assets", json={"name": "Ohne Kontakt", "kind": "property"}).status_code == 201


def test_component_must_belong_to_asset(client):
    a, b = asset(client), asset(client)
    component = client.post("/records/components", json={"asset_id": a["id"], "name": "Motor"}).json()
    assert client.post("/records/work-items", json=work(b["id"], component_id=component["id"])).status_code == 422
    assert client.post("/records/work-items", json=work(a["id"], component_id=component["id"])).status_code == 201
    assert client.put(f'/records/components/{component["id"]}', json={"asset_id": b["id"], "name": "Motor"}).status_code == 409


def test_recurrence_history_and_idempotent_completion(client):
    a = asset(client)
    created = client.post("/records/work-items", json=work(a["id"])).json()
    assert client.get("/dashboard").json()["overdue"] == 1
    completed = work(a["id"], status="done")
    assert client.put(f'/records/work-items/{created["id"]}', json=completed).status_code == 200
    assert client.put(f'/records/work-items/{created["id"]}', json=completed).status_code == 200
    rows = client.get("/records/work-items").json()
    assert len(rows) == 2
    assert next(r for r in rows if r["status"] == "open")["due_date"] == str(date.today() + timedelta(days=30))
    assert next(r for r in rows if r["status"] == "done")["completed_date"] == str(date.today())
    assert client.put(f'/records/work-items/{created["id"]}', json=work(a["id"])).status_code == 409
    assert client.get("/dashboard").json()["overdue"] == 0


def test_finances_use_integer_cents_and_current_month(client):
    a = asset(client)
    payload = {"asset_id": a["id"], "title": "Miete", "direction": "income", "amount_cents": 12345, "booked_date": str(date.today())}
    assert client.post("/records/transactions", json=payload).status_code == 201
    assert client.post("/records/transactions", json=payload | {"amount_cents": 345, "direction": "expense"}).status_code == 201
    assert client.post("/records/transactions", json=payload | {"booked_date": "2000-01-01"}).status_code == 201
    assert client.post("/records/transactions", json=payload | {"amount_cents": 1.5}).status_code == 422
    assert client.post("/records/transactions", json=payload | {"amount_cents": -1}).status_code == 422
    summary = client.get("/dashboard").json()
    assert summary["balance_cents"] == 12000


def test_finances_support_general_and_subarea_assignments(client):
    general = client.post("/records/transactions", json={
        "title": "Gehalt", "direction": "income", "amount_cents": 250000,
        "booked_date": str(date.today()), "category": "salary"
    })
    assert general.status_code == 201, general.text
    assert general.json()["asset_id"] is None
    assert general.json()["component_id"] is None

    a = asset(client)
    floor = client.post("/records/components", json={
        "asset_id": a["id"], "name": "1. OG", "kind": "floor"
    })
    assert floor.status_code == 201, floor.text
    linked = client.post("/records/transactions", json={
        "asset_id": a["id"], "component_id": floor.json()["id"],
        "title": "Lebensmittel", "direction": "expense", "amount_cents": 8500,
        "booked_date": str(date.today()), "category": "groceries"
    })
    assert linked.status_code == 201, linked.text
    assert linked.json()["component_id"] == floor.json()["id"]

    other = asset(client)
    invalid = client.post("/records/transactions", json={
        "asset_id": other["id"], "component_id": floor.json()["id"],
        "title": "Falsch zugeordnet", "direction": "expense", "amount_cents": 100,
        "booked_date": str(date.today()), "category": "other"
    })
    assert invalid.status_code == 422
    assert client.put(f'/records/components/{floor.json()["id"]}', json={
        "asset_id": other["id"], "name": "1. OG", "kind": "floor"
    }).status_code == 409


def test_contracts_store_recurring_terms_and_reminders(client):
    a = asset(client)
    end_date = date.today() + timedelta(days=20)
    payload = {
        "asset_id": a["id"], "title": "Stromvertrag", "provider": "Energie GmbH",
        "market_location_id": "DE0001234567890123456789012345", "billing_cycle": "yearly",
        "amount_cents": 144000, "start_date": str(date.today()), "end_date": str(end_date),
        "reminder_days": 30, "notes": "Vor Verlängerung prüfen",
    }
    created = client.post("/records/contracts", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["billing_cycle"] == "yearly"
    assert created.json()["amount_cents"] == 144000
    assert client.get("/contract-reminders").json()[0]["days_until_end"] == 20
    assert client.post("/records/contracts", json=payload | {"end_date": str(date.today() - timedelta(days=1))}).status_code == 422


def upload(client, asset_id):
    response = client.post("/documents/upload", data={"asset_id": asset_id, "title": "Rechnung", "document_date": "2026-09-01", "category": "invoice"}, files={"file": ("rechnung.txt", b"Rechnungsinhalt", "text/plain")})
    assert response.status_code == 201, response.text
    return response.json()


def test_backup_roundtrip_with_deduplicated_documents_and_corrections(client):
    a = asset(client)
    d = upload(client, a["id"])
    upload(client, a["id"])
    recipient = client.post("/records/notification-recipients", json={
        "channel": "telegram", "label": "Backup Test", "address": "123456789",
        "active": True, "notify_contracts": True, "notify_documents": True, "notify_work_items": True
    })
    assert recipient.status_code == 201, recipient.text
    assert client.put(f'/records/documents/{d["id"]}', json={"asset_id": a["id"], "title": "Energie", "document_date": "2026-08-20", "category": "energy"}).status_code == 200
    before = {name: client.get(f"/records/{name}").json() for name in ("assets", "components", "work-items", "transactions", "documents", "notification-recipients")}
    backup = client.get("/backup/export")
    assert backup.status_code == 200
    preview = client.post("/backup/preview", files={"file": ("backup.zip", backup.content)})
    assert preview.status_code == 200, preview.text
    assert preview.json()["files"] == 1
    asset(client, "vehicle")
    assert client.post("/backup/import", data={"confirmation": "no"}, files={"file": ("backup.zip", backup.content)}).status_code == 422
    response = client.post("/backup/import", data={"confirmation": "WIEDERHERSTELLEN"}, files={"file": ("backup.zip", backup.content)})
    assert response.status_code == 200, response.text
    for name, expected in before.items():
        assert client.get(f"/records/{name}").json() == expected
    assert client.get(f'/documents/{d["id"]}/download').content == b"Rechnungsinhalt"


def test_tax_document_reminder_is_visible(client):
    a = asset(client)
    response = client.post("/documents/upload", data={"asset_id": a["id"], "title": "Steuererklärung 2025", "document_date": str(date.today()), "category": "tax", "reminder_date": str(date.today() + timedelta(days=14)), "reminder_days": "30"}, files={"file": ("steuer.pdf", b"tax", "application/pdf")})
    assert response.status_code == 201, response.text
    reminders = client.get("/reminders").json()
    tax = next(row for row in reminders if row["reminder_type"] == "document")
    assert tax["category"] == "tax"
    assert tax["days_until_reminder"] == 14


def test_multiple_notification_recipients_can_be_managed(client):
    telegram = client.post("/records/notification-recipients", json={"channel": "telegram", "label": "Hausverwaltung", "address": "-100123456", "active": True, "notify_contracts": True, "notify_documents": False, "notify_work_items": True})
    assert telegram.status_code == 201, telegram.text
    assert client.post("/records/notification-recipients", json={"channel": "sms", "label": "Nicht erlaubt", "address": "12345", "active": True}).status_code == 422
    recipients = client.get("/records/notification-recipients").json()
    assert {row["channel"] for row in recipients} == {"telegram"}
    assert recipients[0]["notify_documents"] is False
    assert len(client.get("/notification-recipients/contracts").json()) == 1
    assert len(client.get("/notification-recipients/documents").json()) == 0
    assert client.put(f'/records/notification-recipients/{telegram.json()["id"]}', json={"channel": "telegram", "label": "Hausverwaltung", "address": "-100123456", "active": False}).status_code == 200


def rewrite_zip(content, change):
    with zipfile.ZipFile(io.BytesIO(content)) as source:
        files = {n: source.read(n) for n in source.namelist()}
    change(files)
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as output:
        for name, data in files.items():
            output.writestr(name, data)
    return result.getvalue()


def test_bad_backups_never_change_existing_data(client):
    a = asset(client)
    upload(client, a["id"])
    valid = client.get("/backup/export").content
    def invalid_version(files):
        manifest = json.loads(files["manifest.json"])
        manifest["schema_version"] = 999
        files["manifest.json"] = json.dumps(manifest).encode()
    def corruption(files):
        files[next(n for n in files if n.startswith("uploads/"))] = b"changed"
    for content in [b"not a zip", rewrite_zip(valid, lambda f: f.update({"../escape": b"bad"})), rewrite_zip(valid, invalid_version), rewrite_zip(valid, corruption)]:
        result = client.post("/backup/import", data={"confirmation": "WIEDERHERSTELLEN"}, files={"file": ("bad.zip", content)})
        assert result.status_code == 422, result.text
        assert client.get("/records/assets").json()[0]["id"] == a["id"]


def test_seed_is_explicit_and_non_destructive(client):
    assert client.get("/records/assets").json() == []
    assert client.post("/seed").status_code == 201
    assert client.post("/seed").status_code == 409
    assert len(client.get("/records/assets").json()) == 3


def test_asset_delete_lists_and_can_cascade_dependencies(client):
    a = asset(client)
    component = client.post("/records/components", json={"asset_id": a["id"], "name": "Wohnbereich"}).json()
    client.post("/records/work-items", json=work(a["id"], component_id=component["id"]))
    client.post("/records/transactions", json={"asset_id": a["id"], "title": "Reparatur", "direction": "expense", "amount_cents": 100, "booked_date": str(date.today())})
    upload(client, a["id"])
    dependencies = client.get(f'/records/assets/{a["id"]}/dependencies')
    assert dependencies.status_code == 200
    assert dependencies.json()["total"] == 4
    assert client.delete(f'/records/assets/{a["id"]}').status_code == 409
    assert client.delete(f'/records/assets/{a["id"]}?cascade=true').status_code == 204
    assert client.get("/records/assets").json() == []
    assert client.get("/records/components").json() == []
    assert client.get("/records/work-items").json() == []
    assert client.get("/records/transactions").json() == []
    assert client.get("/records/documents").json() == []
