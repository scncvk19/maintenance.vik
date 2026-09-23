# maintenance.vik

Lokale Webanwendung zur Verwaltung von Immobilien, Grundstücken, Fahrzeugen, technischen Anlagen, Wartungen, Aufgaben, Finanzen, Dokumenten und geschützten Steuerfällen.

## Start unter Windows

1. Docker Desktop starten.
2. `Start.cmd` doppelklicken.
3. Beim ersten Start im Browser das erste Administratorkonto anlegen.
4. Danach läuft die Anwendung standardmäßig unter `http://localhost:3000`.

`Start.cmd` ruft `Start.ps1` mit einer passenden PowerShell-Ausführungsrichtlinie auf. Falls noch keine `.env` existiert, wird dort automatisch ein zufälliges PostgreSQL-Passwort erzeugt.

Alternativ:

```powershell
cd "C:\Maintenance.vik\maintenance.vik"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Start.ps1"
```

## Benutzer und Rollen

Die normale Benutzerverwaltung erfolgt vollständig in der Weboberfläche.

- **Admin** darf Daten lesen und ändern, Benutzer verwalten, Backups verwenden und geschützte Bereiche öffnen.
- **Viewer** darf normale Daten lesen, aber keine Änderungen, Backups oder Steuerbereiche ausführen.
- Passwörter werden nicht im Klartext gespeichert.
- Sitzungen sind zeitlich begrenzt und werden serverseitig verwaltet.

Die älteren Umgebungsvariablen `APP_AUTH_USERS_B64` und `APP_AUTH_PASSWORD` bleiben nur für bestehende Installationen als Kompatibilitätsmodus erhalten. Für neue Installationen werden sie nicht benötigt.

## Telegram

Telegram wird unter **Einstellungen & Backup → Anbindungen → Telegram** eingerichtet.

Dort können Bot-Token, Aktivierung und Prüfintervall verwaltet sowie die Verbindung getestet werden. Telegram-Empfänger und deren Erinnerungstypen werden direkt darunter gepflegt.

Der Bot-Token wird lokal verschlüsselt gespeichert und nach dem Speichern nicht wieder im Klartext ausgegeben. Die älteren `.env`-Variablen für Telegram bleiben als Fallback für bestehende Installationen unterstützt.

Automatische Erinnerungen werden vom separaten `reminder-worker` geprüft. Telegram erhält nur Anzahlen fälliger Einträge, keine Titel, Adressen, Beträge oder Steuerinhalte. Doppelte Sendungen an denselben Empfänger werden pro Kalendertag unterdrückt.

## Lokale Dokumentanalyse / OCR

Bei der Auswahl eines neuen Dokuments startet die lokale Analyse bereits vor dem Speichern und kann Titel, Datum, Kategorie und Asset-Zuordnung vorschlagen. Alle Vorschläge bleiben korrigierbar.

Für gespeicherte Dokumente steht zusätzlich **Lokal analysieren** zur Verfügung. Unterstützt werden PDF, PNG/JPG/WEBP, TXT, CSV und DOCX. Die Analyse läuft lokal im Backend-Container mit Tesseract/Poppler; Dokumentinhalte werden nicht an externe OCR- oder KI-Dienste übertragen.

## Asset-Zustand

maintenance.vik unterscheidet zwei Bewertungen:

- **Manuell**: die vom Benutzer gespeicherte Einschätzung `Gut`, `Beobachten` oder `Kritisch`.
- **System**: automatisch aus offenen Wartungen, Mängeln und Prioritäten berechnet.

Der Systemstatus wird kritisch bei überfälliger Wartung oder einem offenen kritischen/dringenden Mangel. Beobachten gilt unter anderem bei offenen Mängeln, hoher Priorität oder einer Wartung innerhalb der nächsten 30 Tage. Der manuelle Zustand wird dadurch nicht überschrieben.

## Backup

Unter **Einstellungen & Backup** kann der aktuelle Datenbestand inklusive Dokumenten als ZIP exportiert und wiederhergestellt werden. Vor einem Restore wird die Sicherung auf Version, Beziehungen und Prüfsummen geprüft.

Für sehr große Offline-Sicherungen existieren zusätzlich die Skripte unter `scripts/Backup-Large.ps1` und `scripts/Restore-Large.ps1`.

## Installation mit fertigen Docker-Images

Für Installationen ohne lokalen Node.js-/Python-Build:

```powershell
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Benötigt wird mindestens eine lokale `.env` mit:

```text
POSTGRES_PASSWORD=<eigenes starkes Passwort>
APP_PORT=3000
```

Frontend und Backend werden aus GHCR geladen. Datenbank und Dokumente liegen in persistenten Docker-Volumes. Mit `MAINTENANCE_VIK_VERSION` kann später gezielt ein Release-Tag wie `v1.0.0` verwendet werden.

## Dienste

Die normale Installation besteht aus vier Diensten:

- `database` – PostgreSQL 17
- `backend` – FastAPI
- `frontend` – Next.js
- `reminder-worker` – automatische Telegram-Prüfung

Backend und Datenbank werden nicht direkt nach außen veröffentlicht. Das Frontend ist standardmäßig nur an `127.0.0.1` gebunden.

## Entwicklung und Prüfung

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

Backend:

```powershell
cd backend
python -m pip install -r requirements.lock.txt
python -m pytest -q -p no:cacheprovider
```

Docker/Compose:

```powershell
docker compose config
docker compose build
docker compose up -d --wait
docker compose ps
```

Die GitHub-CI prüft zusätzlich PostgreSQL-Backup/Restore, Authentifizierung, Docker-Images, OCR/Preview und die Release-Compose-Konfiguration.

## Netzwerkzugriff

Für Zugriff von anderen Geräten einen abgesicherten VPN-Zugang oder einen HTTPS-Reverse-Proxy verwenden. Datenbank- und Backend-Port nicht separat veröffentlichen.
