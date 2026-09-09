# maintenance.vik

Lokale Webanwendung für Immobilien, Fahrzeuge, technische Anlagen, Termine und geschützte Steuerfälle.

## Start unter Windows

1. Docker Desktop starten.
2. `Start.cmd` doppelklicken.
3. Die Anwendung öffnet sich unter `http://localhost:3000`.

Beim ersten Start erzeugt die Anwendung eine lokale `.env`-Datei mit einem zufälligen Datenbankpasswort. Diese Datei, die Datenbank und hochgeladene Dokumente bleiben lokal und werden nicht in Git übernommen.

## Funktionsbereiche

- Immobilien, Grundstücke, Fahrzeuge und technische Anlagen
- Aufgaben, Mängel, Wartungen und Erinnerungen
- Verträge, Kosten und Dokumente
- Übersichtliche Detailansichten mit Fotos und Verknüpfungen
- Steuerfälle mit verschlüsselten Steuerdaten und Uploads
- Wiederherstellungsschlüssel, automatische Sperre nach 15 Minuten und sichere Neuanlage eines Steuerbereichs
- Export und Import vollständiger Backups

## Entwicklung und Prüfung

Frontend prüfen:

```powershell
cd frontend
npm run lint
npm run typecheck
npm run build
```

Backend prüfen:

```powershell
docker build -t maintenance-vik-backend backend
docker run --rm -v "${PWD}\backend:/work" -w /work maintenance-vik-backend pytest -q -p no:cacheprovider
```

## Sicherung

Unter **Einstellungen & Backup** lässt sich ein Backup exportieren und später wiederherstellen. Ein Backup enthält die Anwendungsdaten, hochgeladene Dokumente und die verschlüsselte Struktur der Steuerfälle. Es enthält weder das Steuerpasswort noch den Wiederherstellungsschlüssel im Klartext.
