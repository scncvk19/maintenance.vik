"""Local analysis tests use isolated SQLite; no real OCR binaries or network."""
import hashlib

from app.database import Session, UPLOADS
from app.models import Document
from app.server import app  # noqa: F401 - register optional routes on shared app


def make_asset(client):
    response = client.post('/records/assets', json={'name': 'Testhaus', 'kind': 'building'})
    assert response.status_code == 201, response.text
    return response.json()['id']


def test_text_document_proposal_is_read_only(client):
    asset_id = make_asset(client)
    content = b'Strom Rechnung September 2026'
    uploaded = client.post('/documents/upload', data={
        'asset_id': asset_id, 'title': 'Beleg', 'document_date': '2026-09-22', 'category': 'other',
    }, files={'file': ('rechnung.txt', content, 'text/plain')})
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    response = client.post(f"/documents/{document['id']}/analyze")
    assert response.status_code == 200, response.text
    assert response.json()['suggested_category'] == 'energy'
    assert response.json()['source'] == 'text'
    assert response.json()['review_required'] is True
    assert 'Strom Rechnung' in response.json()['text_preview']
    with Session() as session:
        saved = session.get(Document, document['id'])
        assert saved.category == 'other' and saved.analysis_status == 'manual'
    assert (UPLOADS / hashlib.sha256(content).hexdigest()).read_bytes() == content


def test_missing_and_corrupt_file_are_rejected(client):
    missing = client.post('/documents/00000000-0000-4000-8000-000000000099/analyze')
    assert missing.status_code == 404
    asset_id = make_asset(client)
    content = b'Steuer'
    uploaded = client.post('/documents/upload', data={
        'asset_id': asset_id, 'title': 'Test', 'document_date': '2026-09-22',
    }, files={'file': ('beleg.txt', content, 'text/plain')})
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    path = UPLOADS / document['storage_key']
    original = path.read_bytes()
    try:
        path.write_bytes(b'kaputt')
        assert client.post(f"/documents/{document['id']}/analyze").status_code == 409
    finally:
        path.write_bytes(original)


def test_category_hint_rejects_ambiguity():
    from app.document_analysis import category_hint
    assert category_hint('Steuer und Versicherung')[0] is None
    assert category_hint('Strom Rechnung')[0] == 'energy'
