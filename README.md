# maintenance.vik

**Version:** `1.0.0-rc.1`  
**Status:** Release Candidate – final operational and clean-install tests are still pending.

> Assets, maintenance, finances & documents in one place.  
> Assets, Wartung, Finanzen & Dokumente zentral verwalten.

[Deutsch](#deutsch) · [English](#english)

---

# Deutsch

## Überblick

**maintenance.vik** ist eine lokal betriebene Webanwendung zur Verwaltung von Beständen und zugehörigen Informationen.

Unterstützt werden unter anderem:

- Gebäude und Immobilien
- Grundstücke
- Fahrzeuge
- Maschinen und technische Anlagen
- Etagen, Räume, Bereiche und Komponenten
- Wartungen, Aufgaben und Mängel
- Kalender und Fälligkeiten
- Einnahmen, Ausgaben und Verträge
- Dokumente und lokale OCR
- geschützte Steuerfälle
- Erinnerungen über Telegram
- Benutzer und Rollen
- Papierkorb, Aktivitätsverlauf und globale Suche
- Backup und Wiederherstellung

Die Anwendung ist für den lokalen Betrieb mit Docker ausgelegt und benötigt für den normalen Einsatz weder eine Cloud-Datenbank noch externe KI-Dienste.

## Aktueller Stand

Der funktionale Kern wurde manuell geprüft:

- Ersteinrichtung und Anmeldung
- Admin-/Viewer-Rollen
- Benutzerverwaltung
- Gebäude, Grundstücke, Fahrzeuge und technische Anlagen
- Etagen, Räume, Bereiche und Komponenten
- Wartungen, Aufgaben und Mängel
- Kalender
- Finanzen und Verträge
- Dokumente und lokale OCR
- globale Suche
- Telegram inklusive Empfänger und echtem Testversand
- Papierkorb
- Aktivitätsverlauf
- Dark Mode
- Backup-Export und Restore
- automatischer Asset-Systemstatus

Zusätzlich laufen in der GitHub-CI unter anderem:

- Python/Ruff-Prüfung
- Backend-Tests mit isolierter SQLite-Datenbank
- PostgreSQL Backup-/Restore-Integrationstest
- Frontend-Lint
- TypeScript-Prüfung
- Produktions-Build
- Authentifizierungsprüfungen
- Docker-Builds
- Development- und Release-Compose-Prüfung
- lokale Dokument-/OCR-Tests

### Noch offen vor `v1.0.0`

Der finale Release-Tag wird **erst nach Abschluss dieser Prüfungen** erstellt:

- vollständiger Docker-Neustart mit Persistenzprüfung
- vollständiger PC-/Docker-Desktop-Neustart mit Persistenzprüfung
- abschließende Responsive-Prüfung auf Desktop, Tablet und Mobil
- gezielte Fehlerfälle und ungültige Eingaben
- finaler Containerstatus
- finale Log-Prüfung
- Installation über `docker-compose.release.yml` und GHCR-Images
- vollständige frische Installation mit leeren Volumes
- letzter kritischer Funktionstest nach allen Änderungen

## Architektur

| Bereich | Technik |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI, Python |
| Datenbank | PostgreSQL 17 |
| Container | Docker / Docker Compose |
| OCR | Tesseract + Poppler |
| Benachrichtigung | Telegram |
| Persistenz | PostgreSQL- und Dokument-Volumes |

Die normale Installation besteht aus vier Diensten:

- `database` – PostgreSQL 17
- `backend` – FastAPI
- `frontend` – Next.js
- `reminder-worker` – automatische Telegram-Prüfung

Backend und Datenbank werden standardmäßig nicht direkt am Host veröffentlicht.

## Schnellstart unter Windows

### Empfohlen

1. Docker Desktop starten.
2. Repository öffnen.
3. `Start.cmd` doppelklicken.
4. Beim ersten Start im Browser das erste Administratorkonto anlegen.
5. Anwendung unter `http://localhost:3000` öffnen.

`Start.cmd` startet `Start.ps1` mit einer geeigneten PowerShell-Ausführungsrichtlinie.

Falls noch keine `.env` vorhanden ist, erzeugt das Startskript automatisch ein zufälliges PostgreSQL-Passwort.

### Manuell

```powershell
cd "C:\Maintenance.vik\maintenance.vik"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Start.ps1"
```

Oder:

```powershell
docker compose up -d --build --wait
```

## Benutzer und Rollen

Die normale Benutzerverwaltung erfolgt direkt in der Weboberfläche.

### Admin

Darf unter anderem:

- Daten lesen und ändern
- Benutzer verwalten
- Backups erstellen und wiederherstellen
- geschützte Bereiche verwenden

### Viewer

Darf normale Daten lesen, aber keine schreibenden Aktionen, Backups oder geschützten Verwaltungsbereiche ausführen.

Passwörter werden nicht im Klartext gespeichert. Sitzungen sind zeitlich begrenzt und werden serverseitig verwaltet.

Die älteren Variablen `APP_AUTH_USERS_B64` und `APP_AUTH_PASSWORD` bleiben nur als Kompatibilitätsweg für bestehende Installationen erhalten.

## Asset-Zustand und Systemstatus

maintenance.vik unterscheidet bewusst zwischen zwei Bewertungen.

### Manueller Zustand

Vom Benutzer festgelegt:

- Gut
- Beobachten
- Kritisch

### Automatischer Systemstatus

Wird aus Wartungen, Aufgaben und Mängeln berechnet.

**Kritisch** bei:

- überfälliger Wartung
- offenem kritischem oder dringendem Mangel

**Beobachten** unter anderem bei:

- offenem Mangel
- Aufgabe mit hoher Priorität
- Wartung innerhalb der nächsten 30 Tage

**Gut**, wenn aktuell kein entsprechender Handlungsbedarf erkannt wird.

Der automatische Status überschreibt die manuelle Einschätzung nicht.

## Finanzen

Der Finanzbereich unterstützt:

- Einnahmen
- Ausgaben
- wiederkehrende Verträge
- monatliche und jährliche Kosten
- allgemeine private Kategorien
- Zuordnung zu Assets
- Zuordnung zu Etagen, Räumen, Bereichen oder Komponenten
- Filter nach Objekt und Unterbereich
- Monatsübersicht und Saldo

Der Finanzbereich dient der persönlichen Übersicht und ersetzt keine vollständige Buchhaltungssoftware.

## Dokumente und lokale OCR

Dokumente können hochgeladen, einem Asset zugeordnet und lokal analysiert werden.

Unterstützte Formate:

- PDF
- PNG
- JPG / JPEG
- WEBP
- TXT
- CSV
- DOCX

Beim Auswählen eines Dokuments kann die lokale Analyse Vorschläge erzeugen für:

- Titel
- Dokumentdatum
- Kategorie
- Asset-Zuordnung

Alle Vorschläge bleiben korrigierbar.

Die Analyse läuft lokal im Backend mit **Tesseract** und **Poppler**. Dokumentinhalte werden nicht an externe OCR- oder KI-Dienste übertragen.

## Telegram-Erinnerungen

Telegram wird unter:

**Einstellungen & Backup → Anbindungen → Telegram**

konfiguriert.

Über die UI lassen sich verwalten:

- Bot-Token
- Aktivierung
- Prüfintervall
- Verbindungstest
- Empfänger / Chat-IDs
- Erinnerungstypen pro Empfänger

Der Bot-Token wird lokal verschlüsselt gespeichert und nach dem Speichern nicht wieder im Klartext angezeigt.

Der `reminder-worker` prüft automatisch nach dem gewählten Intervall.

Telegram erhält bewusst nur Anzahlen fälliger Einträge, beispielsweise:

- Aufgaben/Wartungen
- Vertragsenden
- Dokument-Erinnerungen

Nicht versendet werden unter anderem:

- Objektnamen
- Adressen
- Beträge
- Steuerinhalte
- Dokumentinhalte

Doppelte Erinnerungen an denselben Empfänger werden pro Kalendertag unterdrückt.

## Backup und Restore

Unter **Einstellungen & Backup** kann ein ZIP-Backup erstellt werden.

Das Backup enthält den Anwendungsdatenbestand und die zugehörigen Dokumente/Bilder.

Vor einer Wiederherstellung werden unter anderem geprüft:

- Backup-Version
- Datensatz-Verknüpfungen
- Dokumentreferenzen
- Prüfsummen

Ein Restore ersetzt den aktuellen Datenbestand der gewählten Installation.

Vor jedem produktiven Restore sollte ein zusätzliches aktuelles Backup vorhanden sein.

Für größere Offline-Sicherungen existieren außerdem:

- `scripts/Backup-Large.ps1`
- `scripts/Restore-Large.ps1`

## Installation mit fertigen Docker-Images

Für eine spätere v1.0-Installation ohne lokalen Node.js-/Python-Build ist `docker-compose.release.yml` vorgesehen.

```powershell
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Mindestens erforderlich:

```text
POSTGRES_PASSWORD=<starkes eigenes Passwort>
APP_PORT=3000
```

Mit `MAINTENANCE_VIK_VERSION` kann gezielt ein Release-Tag verwendet werden.

Beispiel nach Freigabe von v1.0:

```text
MAINTENANCE_VIK_VERSION=v1.0.0
```

**Hinweis:** `v1.0.0` ist aktuell noch nicht freigegeben.

## Entwicklung und Tests

### Frontend

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

### Backend

```powershell
cd backend
python -m pip install -r requirements.lock.txt
python -m ruff check app tests integration_postgres.py
python -m pytest -q -p no:cacheprovider
```

### Docker

```powershell
docker compose config
docker compose build
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100
```

## Netzwerk und Sicherheit

Das Frontend ist standardmäßig nur an `127.0.0.1` gebunden.

Für Zugriff von anderen Geräten sollte ein abgesicherter Weg verwendet werden, zum Beispiel:

- VPN
- Tailscale / vergleichbare private Netzwerkverbindung
- HTTPS-Reverse-Proxy

Datenbank- und Backend-Port sollten nicht direkt ins Internet veröffentlicht werden.

Geheimnisse wie PostgreSQL-Passwort und Telegram-Bot-Token gehören nicht in Git, Screenshots oder öffentliche Supportanfragen.

---

# English

## Overview

**maintenance.vik** is a locally hosted web application for managing assets and related operational data.

It supports:

- buildings and real estate
- land and properties
- vehicles
- machines and technical equipment
- floors, rooms, areas and components
- maintenance, tasks and defects
- calendar and due dates
- income, expenses and contracts
- documents and local OCR
- protected tax cases
- Telegram reminders
- users and roles
- recycle bin, activity history and global search
- backup and restore

The application is designed for local Docker deployments and does not require a cloud database or external AI service for its normal operation.

## Current status

The core application has been manually verified for:

- first-run setup and login
- admin/viewer roles
- user management
- buildings, properties, vehicles and technical equipment
- floors, rooms, areas and components
- maintenance, tasks and defects
- calendar
- finances and contracts
- documents and local OCR
- global search
- Telegram including recipients and a real delivery test
- recycle bin
- activity history
- dark mode
- backup export and restore
- automatic asset system health

GitHub CI additionally checks:

- Python/Ruff
- backend tests using isolated SQLite
- PostgreSQL backup/restore integration
- frontend lint
- TypeScript
- production builds
- authentication
- Docker image builds
- development and release Compose files
- local document/OCR workflows

### Remaining before `v1.0.0`

The final release tag will only be created after:

- full Docker restart and persistence verification
- full PC/Docker Desktop restart and persistence verification
- final responsive checks on desktop, tablet and mobile
- targeted invalid-input and error-case testing
- final container status review
- final log review
- installation through `docker-compose.release.yml` and GHCR images
- complete clean installation using empty volumes
- one final critical regression pass after all changes

## Architecture

| Area | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI, Python |
| Database | PostgreSQL 17 |
| Containers | Docker / Docker Compose |
| OCR | Tesseract + Poppler |
| Notifications | Telegram |
| Persistence | PostgreSQL and document volumes |

A normal installation contains four services:

- `database` – PostgreSQL 17
- `backend` – FastAPI
- `frontend` – Next.js
- `reminder-worker` – automatic Telegram checks

The backend and database are not published directly to the host by default.

## Quick start on Windows

### Recommended

1. Start Docker Desktop.
2. Open the repository.
3. Double-click `Start.cmd`.
4. Create the first administrator account in the browser.
5. Open `http://localhost:3000`.

`Start.cmd` launches `Start.ps1` with an appropriate PowerShell execution policy.

If no `.env` exists, the start script automatically generates a random PostgreSQL password.

### Manual start

```powershell
cd "C:\Maintenance.vik\maintenance.vik"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Start.ps1"
```

Or:

```powershell
docker compose up -d --build --wait
```

## Users and roles

Normal user administration is handled directly in the web interface.

### Admin

Can:

- read and modify data
- manage users
- export and restore backups
- access protected administration areas

### Viewer

Can read normal application data but cannot perform write operations, backups or protected administrative actions.

Passwords are not stored in plaintext. Sessions are time-limited and managed server-side.

The older `APP_AUTH_USERS_B64` and `APP_AUTH_PASSWORD` variables remain only as compatibility paths for existing installations.

## Asset condition and system health

maintenance.vik intentionally separates two states.

### Manual condition

Selected by the user:

- Good
- Observe
- Critical

### Automatic system health

Calculated from maintenance, tasks and defects.

**Critical** when:

- maintenance is overdue
- a critical or urgent defect is open

**Observe** when, for example:

- a defect is open
- a high-priority task is open
- maintenance is due within the next 30 days

**Good** when no matching action is currently required.

The automatic system health never overwrites the user's manual assessment.

## Finances

The finance module supports:

- income
- expenses
- recurring contracts
- monthly and yearly costs
- common household/private categories
- assignment to assets
- assignment to floors, rooms, areas or components
- filters by asset and sub-area
- monthly totals and balance

The finance module is intended as a personal overview and is not a replacement for full accounting software.

## Documents and local OCR

Documents can be uploaded, assigned to assets and analyzed locally.

Supported formats include:

- PDF
- PNG
- JPG / JPEG
- WEBP
- TXT
- CSV
- DOCX

When a document is selected, the local analysis can suggest:

- title
- document date
- category
- asset assignment

All suggestions remain editable.

Analysis runs locally in the backend using **Tesseract** and **Poppler**. Document contents are not sent to external OCR or AI services.

## Telegram reminders

Telegram is configured under:

**Settings & Backup → Integrations → Telegram**

The UI provides:

- bot token
- activation
- check interval
- connection test
- recipients / chat IDs
- reminder types per recipient

The bot token is stored locally in encrypted form and is not returned in plaintext after saving.

The `reminder-worker` checks reminders automatically using the selected interval.

Telegram intentionally receives counts only, such as:

- tasks/maintenance
- contract expirations
- document reminders

It does not receive:

- asset names
- addresses
- financial amounts
- tax data
- document contents

Duplicate reminders to the same recipient are suppressed per calendar day.

## Backup and restore

A ZIP backup can be created under **Settings & Backup**.

The backup contains application records and related documents/images.

Before restore, maintenance.vik validates:

- backup version
- record relationships
- document references
- checksums

A restore replaces the current data set of the selected installation.

Always keep a separate current backup before performing a production restore.

Large offline backup helpers are also available:

- `scripts/Backup-Large.ps1`
- `scripts/Restore-Large.ps1`

## Installation using prebuilt Docker images

`docker-compose.release.yml` is intended for the final v1.0 installation path without requiring a local Node.js or Python build.

```powershell
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Minimum local configuration:

```text
POSTGRES_PASSWORD=<your own strong password>
APP_PORT=3000
```

`MAINTENANCE_VIK_VERSION` can be used to select a specific release tag.

Example after v1.0 has been released:

```text
MAINTENANCE_VIK_VERSION=v1.0.0
```

**Note:** `v1.0.0` has not been released yet.

## Development and testing

### Frontend

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

### Backend

```powershell
cd backend
python -m pip install -r requirements.lock.txt
python -m ruff check app tests integration_postgres.py
python -m pytest -q -p no:cacheprovider
```

### Docker

```powershell
docker compose config
docker compose build
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100
```

## Network and security

The frontend is bound to `127.0.0.1` by default.

For access from other devices, use a protected path such as:

- VPN
- Tailscale or a similar private network
- HTTPS reverse proxy

Do not expose the database or backend ports directly to the internet.

Secrets such as the PostgreSQL password and Telegram bot token should never be committed to Git or posted in public screenshots or support requests.

---

## License

No license has been declared yet. Until a license is added, normal copyright rules apply.
