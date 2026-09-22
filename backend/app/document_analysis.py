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

from fastapi import APIRouter, HTTPException

from .database import Session, UPLOADS, data_lock
from .models import Document

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
