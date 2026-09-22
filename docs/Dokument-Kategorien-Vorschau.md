# Lokale Dokument-Kategorien-Vorschau

Das Skript `scripts/suggest_document_categories.py` schlägt anhand von **Dokumenttitel und Dateiname** Kategorien vor. Es liest nur `manifest.json` aus einer vorhandenen maintenance.vik-Backup-ZIP; hochgeladene Dateien, Steuerinhalte und Dokumentnotizen werden **nicht** gelesen oder an einen Dienst übertragen. Die Vorschau ist **keine OCR und keine KI**. Mehrdeutige Treffer bleiben ohne Vorschlag. Es werden **keine Änderungen** an der Datenbank oder am Backup vorgenommen.

## Windows / PowerShell

1. Ein bereits geprüftes Backup auswählen, etwa `N:\maintenance.vik\backups\maintenance-vik-...zip`.
2. Eine Vorschau als CSV erstellen (nur lokal, Ziel darf noch nicht existieren):

```powershell
py -3 "N:\maintenance.vik\scripts\suggest_document_categories.py" "N:\maintenance.vik\backups\MEIN-BACKUP.zip" --output "$env:USERPROFILE\Documents\maintenance-kategorien.csv"
```

Ohne `--output` wird die Vorschau im Terminal ausgegeben. Die CSV enthält Dokumenttitel und Dateinamen und kann daher personenbezogene Informationen enthalten: nicht öffentlich teilen oder in Git einchecken. `review_required=ja` markiert nur eine Abweichung zur gespeicherten Kategorie. Jeder Vorschlag muss vor einer manuellen Änderung geprüft werden; ein automatisches Anwenden ist absichtlich nicht enthalten.

**Wichtig:** Die Vorschau ersetzt weder eine Datensicherung noch einen Wiederherstellungstest. Für Scans und Bild-PDFs ist künftig eine separate, ausdrücklich aktivierte lokale Texterkennung nötig.
