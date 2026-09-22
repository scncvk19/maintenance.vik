"""Explicit manual category update only; uses temporary SQLite database."""
from app.database import Session, UPLOADS
from app.models import Document
from app.server import app  # noqa: F401 - register routes on the existing shared app


def test_category_requires_consent_and_detects_conflict(client):
    asset = client.post('/records/assets', json={'name': 'Testobjekt', 'kind': 'building'})
    assert asset.status_code == 201, asset.text
    upload = client.post('/documents/upload', data={
        'asset_id': asset.json()['id'], 'title': 'Testbeleg',
        'document_date': '2026-09-22', 'category': 'other',
    }, files={'file': ('test.txt', b'Strom Rechnung', 'text/plain')})
    assert upload.status_code == 201, upload.text
    doc = upload.json()
    original_bytes = (UPLOADS / doc['storage_key']).read_bytes()
    path = f"/documents/{doc['id']}/confirm-category"
    assert client.post(path).status_code == 422
    assert client.post(path, json={'category': 'invalid', 'expected_category': 'other', 'expected_sha256': doc['sha256']}).status_code == 422
    assert client.post(path, json={'category': 'energy', 'expected_category': 'invoice', 'expected_sha256': doc['sha256']}).status_code == 409
    result = client.post(path, json={'category': 'energy', 'expected_category': 'other', 'expected_sha256': doc['sha256']})
    assert result.status_code == 200, result.text
    assert result.json()['category'] == 'energy'
    assert client.post(path, json={'category': 'tax', 'expected_category': 'other', 'expected_sha256': doc['sha256']}).status_code == 409
    with Session() as session:
        saved = session.get(Document, doc['id'])
        assert saved.category == 'energy' and saved.analysis_status == 'manual'
    assert (UPLOADS / doc['storage_key']).read_bytes() == original_bytes
