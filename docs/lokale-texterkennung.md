# Lokale Texterkennung – kontrollierte Vorschau

Die Dokumentanalyse ist direkt in der normalen Dokumentverwaltung integriert.

Beim Auswählen eines neuen Dokuments kann maintenance.vik lokal Titel, Dokumentdatum, Kategorie und eine passende Asset-Zuordnung vorschlagen. Bereits gespeicherte Dokumente lassen sich zusätzlich über **Lokal analysieren** prüfen.

Die Analyse erfolgt im Backend-Container mit Tesseract (Deutsch/Englisch) und Poppler. Es werden **keine Cloud-, KI- oder externen OCR-APIs** aufgerufen. Bei PDFs wird zuerst die vorhandene Textebene verwendet; bei Scans wird OCR auf höchstens die ersten drei PDF-Seiten angewandt. Bilder (PNG/JPG/WEBP), TXT, CSV und DOCX werden unterstützt.

**Grenzen:** maximal 10 MB für die Analyse und höchstens drei PDF-Seiten bei OCR. Schlechte Scanqualität, Handschrift und ungewöhnliche Layouts können falsche Ergebnisse liefern. Vorschläge bleiben deshalb vor dem Speichern korrigierbar.

Nach Änderungen an OCR-Systempaketen muss der Backend-Container neu gebaut werden:

```powershell
docker compose up -d --build
```

Backup-Restore-Tests sollten ausschließlich mit einer geprüften Sicherung beziehungsweise einer isolierten Testinstallation durchgeführt werden.
