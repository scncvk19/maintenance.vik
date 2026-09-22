"""Extension contracts; no document or reminder leaves this application yet."""
from dataclasses import dataclass
from typing import Protocol


@dataclass
class AnalysisProposal:
    extracted_text: str
    category: str | None
    document_date: str | None
    confidence: float


class DocumentAnalyzer(Protocol):
    def analyze(self, content: bytes, filename: str) -> AnalysisProposal: ...


class NotificationChannel(Protocol):
    def send(self, title: str, message: str, deduplication_key: str) -> None: ...


INTEGRATIONS = [
    {"name": "Dokumentenanalyse / OCR", "status": "prepared", "description": "Schnittstelle vorbereitet. Kategorien und Datum werden derzeit manuell gepflegt."},
    {"name": "Telegram", "status": "prepared", "description": "Kanal-Schnittstelle vorbereitet. Noch kein Versand und kein Bot verbunden."},
    {"name": "WhatsApp", "status": "available", "description": "Optionaler Templateversand über die WhatsApp Cloud API; ohne lokale Provider-Konfiguration deaktiviert."},
]
