#!/usr/bin/env python3
"""Suggest document categories from a local maintenance.vik backup; never imports data.

This tool reads ONLY manifest.json metadata (titles and filenames), never file
contents. Suggestions are intentionally not applied to the application.
"""

import argparse
import csv
import json
import re
import sys
import zipfile
from pathlib import Path

MAX_MANIFEST = 20 * 1024 * 1024
MAX_DOCUMENTS = 10000
FIELDS = ("id", "title", "filename", "current_category", "suggested_category", "matched_keywords", "review_required")

# Specific terms are deliberately preferred over vague words such as "Dokument".
KEYWORDS = {
    "energy": ("strom", "gas", "energie", "fernwärme", "fernwaerme", "wasserrechnung", "stromzähler", "stromzaehler"),
    "tax": ("steuer", "finanzamt", "grundsteuer", "steuerbescheid", "einkommensteuer"),
    "insurance": ("versicherung", "police", "haftpflicht", "hausrat", "kasko", "schadensmeldung"),
    "maintenance": ("wartung", "inspektion", "prüfbericht", "pruefbericht", "schornsteinfeger"),
    "repair": ("reparatur", "instandsetzung", "mängel", "maengel", "defekt"),
    "rent": ("miete", "mietvertrag", "nebenkosten", "betriebskosten", "mietzahlung"),
    "invoice": ("rechnung", "quittung", "beleg", "kassenbon"),
}


def suggest(title: str, filename: str) -> tuple[str, str]:
    text = re.sub(r"[^\wäöüß]+|_", " ", f"{title} {filename}".casefold())
    matches = {
        category: [word for word in words if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text)]
        for category, words in KEYWORDS.items()
    }
    matches = {category: words for category, words in matches.items() if words}
    # Generic invoices often include a more specific category; otherwise do
    # not guess when different specific categories collide.
    specific = {category: words for category, words in matches.items() if category != "invoice"}
    relevant = specific or matches
    if len(relevant) != 1:
        return "", ", ".join(sorted({word for words in relevant.values() for word in words}))
    category, words = next(iter(relevant.items()))
    return category, ", ".join(words)


def safe_csv_value(value: object) -> str:
    """Avoid spreadsheet formula execution when users open CSV in Excel."""
    text = str(value if value is not None else "")
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def preview(backup: Path) -> list[dict[str, str]]:
    if not backup.is_file():
        raise ValueError("Die angegebene Backup-Datei wurde nicht gefunden.")
    with zipfile.ZipFile(backup, "r") as archive:
        info = archive.getinfo("manifest.json")
        if info.file_size > MAX_MANIFEST:
            raise ValueError("Das Backup-Manifest ist zu groß.")
        with archive.open(info) as stream:
            manifest = json.load(stream)
    if not isinstance(manifest, dict) or manifest.get("application") != "maintenance.vik" or manifest.get("schema_version") != 1:
        raise ValueError("Dies ist kein unterstütztes maintenance.vik-Backup.")
    data = manifest.get("data")
    documents = data.get("documents") if isinstance(data, dict) else None
    if not isinstance(documents, list) or len(documents) > MAX_DOCUMENTS:
        raise ValueError("Die Dokumentliste ist ungültig oder zu groß.")
    rows = []
    for doc in documents:
        if not isinstance(doc, dict):
            raise ValueError("Ein Dokumenteintrag ist ungültig.")
        title, filename = doc.get("title"), doc.get("filename")
        if not isinstance(title, str) or not isinstance(filename, str):
            raise ValueError("Titel oder Dateiname fehlt.")
        category, keywords = suggest(title, filename)
        current = doc.get("category", "other")
        rows.append({
            "id": safe_csv_value(doc.get("id", "")),
            "title": safe_csv_value(title),
            "filename": safe_csv_value(filename),
            "current_category": safe_csv_value(current),
            "suggested_category": category,
            "matched_keywords": keywords,
            "review_required": "ja" if category and category != current else "nein",
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Lokale Kategorie-Vorschau aus einem Backup (nur lesend; keine KI/Cloud).")
    parser.add_argument("backup", type=Path, help="Pfad zur maintenance.vik-Backup-ZIP")
    parser.add_argument("--output", type=Path, help="Optionaler CSV-Zielpfad; vorhandene Dateien werden nicht überschrieben")
    args = parser.parse_args()
    try:
        rows = preview(args.backup)
        if args.output:
            # Exclusive creation protects existing reports from accidental overwrite.
            with args.output.open("x", newline="", encoding="utf-8-sig") as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            print(f"{len(rows)} Dokumente geprüft. Vorschau gespeichert: {args.output}")
        else:
            writer = csv.DictWriter(sys.stdout, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        print(f"Keine Vorschau erstellt: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
