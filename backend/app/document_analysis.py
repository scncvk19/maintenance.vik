"""Opt-in local document text preview. Never persists text or changes the document.

Only the first three PDF pages are inspected to bound CPU and memory. All text
remains on this server; no third-party service receives any document content.
"""
import hashlib
import os
import re
import subprocess
import tempfile
import threading
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .database import Session, UPLOADS, data_lock
from .models import Asset, Document

router = APIRouter(prefix="/documents", tags=["documents"])
_LIMIT_BYTES = 10 * 1024 * 1024
_MAX_TEXT = 1800
_ANALYSIS_LOCK = threading.Lock()
_RULES = {
    "energy": ("strom", "gas", "energie", "fernwärme", "zähler", "heizkosten"),
    "tax": ("steuer", "finanzamt", "grundsteuer"),
    "insurance": ("versicherung", "haftpflicht", "police", "kasko"),
    "maintenance": ("wartung", "inspektion", "prüfbericht", "schornsteinfeger"),
    "repair": ("reparatur", "instandsetzung", "mangel", "defekt"),
    "rent": ("miete", "mietvertrag", "nebenkosten", "betriebskosten"),
    "invoice": ("rechnung", "quittung", "kassenbon", "beleg"),
}

_DATE_PATTERNS = (
    re.compile(r"(?<!\d)(\d{2})[.\-/](\d{2})[.\-/](\d{4})(?!\d)"),
    re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)"),
)


def date_hint(text: str) -> str | None:
    for index, pattern in enumerate(_DATE_PATTERNS):
        match = pattern.search(text)
        if not match:
            continue
        try:
            if index == 0:
                day, month, year = map(int, match.groups())
            else:
                year, month, day = map(int, match.groups())
            from datetime import date
            return date(year, month, day).isoformat()
        except ValueError:
            continue
    return None


def title_hint(text: str, filename: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if 4 <= len(line) <= 120]
    for line in lines[:8]:
        lowered = line.casefold()
        if not re.fullmatch(r"[\d\s.,:/-]+", line) and not any(token in lowered for token in ("seite ", "page ")):
            return line[:160]
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return stem[:160] or "Dokument"


def asset_hint(text: str, assets: list[Asset]) -> tuple[str | None, float]:
    source = re.sub(r"[^a-z0-9äöüß]+", " ", text.casefold())
    tokens = set(source.split())
    best_id, best_score = None, 0.0
    for asset in assets:
        score = 0.0
        name = str(asset.name or "").casefold().strip()
        location = str(asset.location or "").casefold().strip()
        if len(name) >= 3 and name in source:
            score += 0.75
        if len(location) >= 6 and location in source:
            score += 0.95
        asset_tokens = {token for token in re.sub(r"[^a-z0-9äöüß]+", " ", f"{name} {location} {asset.contact_last_name or ''}".casefold()).split() if len(token) >= 3}
        overlap = tokens & asset_tokens
        score += min(0.3, len(overlap) * 0.1)
        if score > best_score:
            best_id, best_score = asset.id, min(score, 1.0)
    return (best_id, best_score) if best_score >= 0.6 else (None, best_score)


def category_hint(text: str) -> tuple[str | None, float]:
    normalized = re.sub(r"[^\wäöüß]+|_", " ", text.casefold())
    matches = {
        category for category, keywords in _RULES.items()
        if any(re.search(rf"(?<!\w){re.escape(keyword)}(?!\w)", normalized) for keyword in keywords)
    }
    specific = matches - {"invoice"}
    considered = specific or matches
    return (next(iter(considered)), 0.72) if len(considered) == 1 else (None, 0.0)


def _command(args: list[str], timeout: int = 20) -> str:
    """Invoke bounded, non-shell local binaries without passing app secrets."""
    environment = {key: os.environ[key] for key in ("PATH", "LANG", "HOME", "TMPDIR") if key in os.environ}
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=timeout, env=environment, check=False)
    except FileNotFoundError as exc:
        raise HTTPException(503, "Lokale OCR-Werkzeuge fehlen im Backend-Image.") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "Texterkennung hat zu lange gedauert.") from exc
    if result.returncode != 0:
        raise HTTPException(422, "Dokument konnte nicht sicher gelesen werden.")
    return result.stdout[:_MAX_TEXT * 6].decode("utf-8", errors="replace")


def extract_document(path: Path, suffix: str, content: bytes) -> tuple[str, str]:
    if suffix in {".txt", ".csv"}:
        return content.decode("utf-8-sig", errors="replace"), "text"
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(path) as archive:
                info = archive.getinfo("word/document.xml")
                if info.file_size > _LIMIT_BYTES:
                    raise ValueError("DOCX-Inhalt zu groß")
                root = ET.fromstring(archive.read(info))
            words = [element.text for element in root.iter()
                     if element.tag.endswith("}t") and element.text]
            return " ".join(words), "docx-text"
        except (zipfile.BadZipFile, KeyError, ET.ParseError, ValueError) as exc:
            raise HTTPException(422, "DOCX-Datei kann nicht gelesen werden.") from exc
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return _command(["tesseract", str(path), "stdout", "-l", "deu+eng"], timeout=30), "ocr"
    if suffix == ".pdf":
        with tempfile.TemporaryDirectory(prefix="maintenance-ocr-") as temporary:
            result = _command(["pdftotext", "-f", "1", "-l", "3", "-layout", str(path), "-"], timeout=20)
            if len(result.strip()) >= 40:
                return result, "pdf-text"
            prefix = str(Path(temporary) / "page")
            _command(["pdftoppm", "-f", "1", "-l", "3", "-scale-to", "1800", "-png", str(path), prefix], timeout=30)
            pages = sorted(Path(temporary).glob("page-*.png"))[:3]
            if not pages:
                raise HTTPException(422, "PDF enthält keine lesbaren Seiten.")
            return "\n".join(_command(["tesseract", str(page), "stdout", "-l", "deu+eng"], timeout=30)
                             for page in pages), "pdf-ocr"
    raise HTTPException(415, "Texterkennung unterstützt derzeit PDF, Bilder, TXT, CSV und DOCX.")


@router.post("/analyze-upload")
async def analyze_upload(file: UploadFile = File(...)):
    if not _ANALYSIS_LOCK.acquire(blocking=False):
        raise HTTPException(429, "Die lokale Texterkennung ist beschäftigt. Bitte später erneut starten.")
    try:
        filename = Path((file.filename or "Dokument").replace("\\", "/")).name[:255]
        suffix = Path(filename).suffix.lower()
        content = await file.read(_LIMIT_BYTES + 1)
        if len(content) > _LIMIT_BYTES:
            raise HTTPException(413, "Texterkennung ist auf 10 MB pro Dokument begrenzt.")
        if not content:
            raise HTTPException(422, "Die Datei ist leer.")
        with tempfile.TemporaryDirectory(prefix="maintenance-prefill-") as temporary:
            path = Path(temporary) / ("upload" + suffix)
            path.write_bytes(content)
            extracted, source = extract_document(path, suffix, content)
        category, confidence = category_hint(extracted)
        with data_lock, Session() as session:
            assets = session.query(Asset).all()
        asset_id, asset_confidence = asset_hint(extracted, assets)
        return {
            "text_preview": extracted[:_MAX_TEXT],
            "source": source,
            "suggested_title": title_hint(extracted, filename),
            "suggested_date": date_hint(extracted),
            "suggested_category": category,
            "category_confidence": confidence,
            "suggested_asset_id": asset_id,
            "asset_confidence": asset_confidence,
            "review_required": True,
            "note": "Lokale OCR-Vorschläge. Bitte vor dem Speichern prüfen.",
        }
    finally:
        _ANALYSIS_LOCK.release()


@router.post("/{document_id}/analyze")
def analyze_document(document_id: str):
    if not _ANALYSIS_LOCK.acquire(blocking=False):
        raise HTTPException(429, "Die lokale Texterkennung ist beschäftigt. Bitte später erneut starten.")
    try:
        with data_lock, Session() as session:
            document = session.get(Document, document_id)
            if document is None:
                raise HTTPException(404, "Dokument nicht gefunden.")
            key, suffix, expected, size = (document.storage_key, Path(document.filename).suffix.lower(),
                                           document.sha256, document.size)
        path = UPLOADS / key
        if not path.is_file():
            raise HTTPException(404, "Dokumentdatei fehlt.")
        if size > _LIMIT_BYTES:
            raise HTTPException(413, "Texterkennung ist auf 10 MB pro Dokument begrenzt.")
        content = path.read_bytes()
        if len(content) != size or hashlib.sha256(content).hexdigest() != expected:
            raise HTTPException(409, "Dokumentdatei ist beschädigt; keine Analyse.")
        extracted, source = extract_document(path, suffix, content)
        category, confidence = category_hint(extracted)
        return {
            "text_preview": extracted[:_MAX_TEXT], "truncated": len(extracted) > _MAX_TEXT,
            "source": source, "suggested_category": category, "confidence": confidence,
            "review_required": bool(category),
            "note": "Nur eine lokale Vorschau. Keine Kategorie wurde automatisch gespeichert.",
        }
    finally:
        _ANALYSIS_LOCK.release()
