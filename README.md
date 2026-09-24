# maintenance.vik

**Version:** `1.0.0-rc.1`  
**Status:** Release Candidate – functional acceptance tests completed successfully.

> Assets, maintenance, finances and documents in one locally hosted application.  
> Bestände, Wartung, Finanzen und Dokumente in einer lokal betriebenen Anwendung.

[Deutsch](#deutsch) · [English](#english)

---

# Deutsch

## Überblick

**maintenance.vik** ist eine lokal betriebene Webanwendung zur Verwaltung von Beständen und den dazugehörigen Wartungen, Finanzen, Verträgen und Dokumenten.

Die Anwendung richtet sich an private und lokale Einsatzszenarien und läuft vollständig über Docker. Für den normalen Betrieb werden weder eine Cloud-Datenbank noch externe KI-Dienste benötigt.

Unterstützt werden unter anderem:

- Gebäude, Immobilien und Grundstücke
- Fahrzeuge, Maschinen und technische Anlagen
- Etagen, Räume, Bereiche und Komponenten
- Wartungen, Aufgaben, Mängel und Fälligkeiten
- Kalender und Erinnerungen
- Einnahmen, Ausgaben und Verträge
- Dokumente und lokale OCR
- geschützter Steuer-Tresor
- Telegram-Erinnerungen
- lokale Benutzerverwaltung mit Admin-/Viewer-Rollen
- globale Suche
- Papierkorb und Wiederherstellung
- Aktivitätsverlauf
- Backup und Restore

## Aktueller Stand

Der Release Candidate wurde in einer getrennten Docker-Testumgebung funktional geprüft.

Erfolgreich getestet wurden unter anderem:

- Docker-Build und Anwendungsstart
- PostgreSQL-, Backend- und Frontend-Healthchecks
- saubere Ersteinrichtung mit leerer Datenbank
- Admin-Anmeldung und Benutzerverwaltung
- Viewer-Rolle mit eingeschränkten Rechten
- Objekte und Fahrzeuge
- Räume, Komponenten und Zuordnungen
- Wartungen, Intervalle und Folgeaufgaben
- Finanzen und Salden
- Dokument-Upload und Download
- lokale OCR und korrigierbare Vorschläge
- Verträge und Erinnerungen
- Steuer-Tresor und Wiederherstellungsfunktionen
- globale Suche
- Papierkorb und Wiederherstellung
- Aktivitätsverlauf
- Backup-Export und Restore
- SHA-256-Prüfung von Backups
- getrennte Test-Volumes und Test-Datenbank
- Telegram-Funktionen und Reminder-Worker

Während der Abschlussprüfung wurden zusätzlich der Backup-Login für die aktuelle lokale Benutzerverwaltung sowie der Schutz vor versehentlich wiederverwendeten Test-Volumes verbessert.

Der Stand ist für die Veröffentlichung des Quellcodes vorbereitet. `v1.0.0` ist noch nicht als finaler Release-Tag veröffentlicht.

### Noch vor `v1.0.0`

Vor dem finalen Release sind noch zwei gezielte Sicherheits-Härtungen vorgesehen:

- **Next.js aktualisieren:** von `16.3.4` auf mindestens `16.3.6` oder eine neuere geprüfte Version.
- **Druckansicht des Steuerbereichs härten:** benutzereditierbare Texte in der Checklisten-/Druckfunktion vor der Ausgabe über `document.write()` HTML-sicher escapen, um eine mögliche Script-/HTML-Injection zu vermeiden.

Nach diesen Änderungen werden die Frontend-, Docker- und Funktionstests erneut ausgeführt.

## Architektur

| Bereich | Technik |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | FastAPI, Python |
| Datenbank | PostgreSQL 17 |
| Container | Docker / Docker Compose |
| OCR | Tesseract + Poppler |
| Benachrichtigungen | Telegram |
| Persistenz | PostgreSQL- und Dokument-Volumes |

Die Standardinstallation besteht aus vier Diensten:

- `database` – PostgreSQL 17
- `backend` – FastAPI
- `frontend` – Next.js
- `reminder-worker` – automatische Prüfung von Erinnerungen

Backend und Datenbank werden standardmäßig nicht direkt am Host veröffentlicht. Das Frontend wird lokal an `127.0.0.1` gebunden.

## Schnellstart unter Windows

### Empfohlen

1. Docker Desktop installieren und starten.
2. Repository klonen oder aktualisieren.
3. `Start.cmd` doppelklicken.
4. Beim ersten Start das erste Administratorkonto im Browser anlegen.
5. maintenance.vik unter `http://localhost:3000` öffnen.

`Start.cmd` startet `Start.ps1` mit einer passenden PowerShell-Ausführungsrichtlinie.

Falls noch keine lokale `.env` existiert, erzeugt das Startskript automatisch ein zufälliges PostgreSQL-Passwort.

### Start über PowerShell

```powershell
cd "C:\Maintenance.vik\maintenance.vik"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Start.ps1"
```

Ein direkter Start mit Docker Compose ist ebenfalls möglich, setzt aber eine gültige lokale `.env` voraus:

```powershell
docker compose up -d --build --wait
```

Status prüfen:

```powershell
docker compose ps
```

## Benutzer und Rollen

Die Benutzerverwaltung erfolgt lokal in maintenance.vik.

### Admin

Administratoren dürfen unter anderem:

- Daten lesen, anlegen, bearbeiten und löschen
- Benutzer verwalten
- Backups erstellen und wiederherstellen
- geschützte Verwaltungsbereiche verwenden

### Viewer

Viewer dürfen normale Anwendungsdaten lesen, aber keine schreibenden Aktionen durchführen. Backup-, Steuer- und Benutzerverwaltungsfunktionen sind für Viewer gesperrt.

Passwörter werden nicht im Klartext gespeichert. Sitzungen sind zeitlich begrenzt und werden serverseitig verwaltet.

Die älteren Variablen `APP_AUTH_USERS_B64` und `APP_AUTH_PASSWORD` bleiben nur als Kompatibilitätsweg für bestehende Installationen erhalten.

## Asset-Zustand und Systemstatus

maintenance.vik unterscheidet zwischen einer manuellen Einschätzung und einem automatisch berechneten Systemstatus.

### Manueller Zustand

Vom Benutzer festgelegt:

- Gut
- Beobachten
- Kritisch

### Automatischer Systemstatus

Der Systemstatus berücksichtigt unter anderem:

- überfällige Wartungen
- offene Mängel
- dringende oder kritische Einträge
- Aufgaben mit hoher Priorität
- in Kürze fällige Wartungen

Der automatisch berechnete Status überschreibt die manuelle Einschätzung nicht.

## Finanzen

Der Finanzbereich unterstützt unter anderem:

- Einnahmen und Ausgaben
- wiederkehrende Verträge
- monatliche und jährliche Kosten
- Kategorien
- Zuordnung zu Assets und Komponenten
- Filter nach Objekt und Unterbereich
- Monatsübersicht und Saldo

Der Finanzbereich dient der persönlichen Übersicht und ersetzt keine vollständige Buchhaltungssoftware oder Steuerberatung.

## Dokumente und lokale OCR

Dokumente können hochgeladen, Assets zugeordnet, angezeigt und wieder heruntergeladen werden.

Unterstützte Formate umfassen:

- PDF
- PNG
- JPG / JPEG
- WEBP
- TXT
- CSV
- DOCX
- XLSX

Die lokale Dokumentanalyse kann Vorschläge für Metadaten und Kategorien erzeugen. Vorschläge werden nicht ungefragt übernommen und bleiben vor dem Speichern korrigierbar.

OCR und PDF-Texterkennung laufen lokal mit **Tesseract** und **Poppler**. Dokumentinhalte werden dafür nicht an externe KI- oder OCR-Dienste übertragen.

## Telegram-Erinnerungen

Telegram wird unter **Einstellungen & Backup → Anbindungen → Telegram** eingerichtet.

Konfigurierbar sind unter anderem:

- Bot-Token
- Aktivierung
- Prüfintervall
- Verbindungstest
- Empfänger / Chat-IDs
- Erinnerungstypen pro Empfänger

Der Bot-Token wird lokal geschützt gespeichert und nach dem Speichern nicht wieder im Klartext angezeigt.

Der `reminder-worker` prüft Erinnerungen automatisch. Telegram erhält bewusst nur die für die Erinnerung notwendigen Informationen; sensible Dokument-, Steuer- oder Finanzinhalte sollen nicht versendet werden.

## Backup und Restore

maintenance.vik unterstützt ein ZIP-basiertes Anwendungsbackup mit Prüfsummen.

Ein Backup kann über die Weboberfläche oder unter Windows mit dem vorhandenen Skript erstellt werden:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '.\scripts\Backup.ps1' -Credential (Get-Credential -UserName 'admin')"
```

Bei Installationen mit einem anders benannten Administratorkonto kann im Anmeldedialog der entsprechende Benutzername verwendet werden.

Das Skript:

- exportiert den Anwendungsbestand
- prüft das Backup-Manifest
- kontrolliert enthaltene Dokumente
- erstellt eine SHA-256-Prüfsumme
- verändert oder importiert keine Daten

Vor einem produktiven Restore sollte immer eine zusätzliche, unabhängig gespeicherte Sicherung vorhanden sein.

Für größere Offline-Sicherungen stehen zusätzlich zur Verfügung:

- `scripts/Backup-Large.ps1`
- `scripts/Verify-LargeBackup.ps1`
- `scripts/Restore-Large.ps1`

## Sichere Testumgebung

Destruktive Restore- oder Browser-Tests dürfen nicht gegen die normale Installation ausgeführt werden.

Für einen getrennten Test-Checkout:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Prepare-TestEnvironment.ps1"
```

Das Skript prüft unter anderem:

- aktuellen `main`-Branch
- unveränderten Git-Arbeitsstand
- vorhandenes und geprüftes Backup
- alte Docker-Testcontainer und Test-Volumes
- getrennten Zielordner

Die Testinstanz wird anschließend bewusst mit einem eigenen Compose-Projektnamen gestartet:

```powershell
cd "C:\Maintenance.vik\maintenance.vik-test"
docker compose -p maintenance-vik-test up -d --build --wait
```

Standardmäßig läuft sie auf:

```text
http://localhost:3100
```

## Installation mit fertigen Docker-Images

Für Installationen ohne lokalen Node.js-/Python-Build ist `docker-compose.release.yml` vorgesehen.

```powershell
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Mindestens erforderlich:

```text
POSTGRES_PASSWORD=<starkes eigenes Passwort>
APP_PORT=3000
```

Mit `MAINTENANCE_VIK_VERSION` kann später gezielt ein Release-Tag ausgewählt werden.

Beispiel nach Veröffentlichung von v1.0.0:

```text
MAINTENANCE_VIK_VERSION=v1.0.0
```

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

Für den Zugriff von anderen Geräten sollte ein abgesicherter Weg verwendet werden, zum Beispiel:

- VPN
- Tailscale oder eine vergleichbare private Netzwerkverbindung
- HTTPS-Reverse-Proxy

Datenbank- und Backend-Port sollten nicht direkt ins Internet veröffentlicht werden.

Geheimnisse wie PostgreSQL-Passwort oder Telegram-Bot-Token gehören nicht in Git, Screenshots oder öffentliche Supportanfragen.

## Lizenz

maintenance.vik wird unter der **MIT-Lizenz** veröffentlicht.

Damit darf der Code unter den Bedingungen der Lizenz verwendet, verändert und weitergegeben werden. Der Copyright- und Lizenzhinweis muss erhalten bleiben.

Siehe [LICENSE](LICENSE).

---

# English

## Overview

**maintenance.vik** is a locally hosted web application for managing assets together with maintenance, finances, contracts and documents.

It is designed for private and local deployments and runs through Docker. Normal operation does not require a cloud database or an external AI service.

Features include:

- buildings, real estate and land
- vehicles, machines and technical equipment
- floors, rooms, areas and components
- maintenance, tasks, defects and due dates
- calendar and reminders
- income, expenses and contracts
- documents and local OCR
- protected tax vault
- Telegram reminders
- local user management with admin/viewer roles
- global search
- recycle bin and restore
- activity history
- backup and restore

## Current status

The release candidate has completed a functional acceptance pass in an isolated Docker test environment.

Successfully verified areas include:

- Docker build and application startup
- PostgreSQL, backend and frontend health checks
- clean first-run setup with an empty database
- admin login and user management
- restricted viewer permissions
- assets and vehicles
- rooms, components and relationships
- maintenance intervals and follow-up tasks
- finances and balances
- document upload and download
- local OCR with editable suggestions
- contracts and reminders
- tax vault and recovery functionality
- global search
- recycle bin and restore
- activity history
- backup export and restore
- SHA-256 backup verification
- isolated test database and Docker volumes
- Telegram features and reminder worker

During the final acceptance pass, backup authentication for the current local user system and safeguards against accidentally reusing stale Docker test volumes were also improved.

The source tree is prepared for public release. A final `v1.0.0` release tag has not been published yet.

### Still planned before `v1.0.0`

Two targeted security-hardening tasks remain before the final release:

- **Update Next.js:** from `16.3.4` to at least `16.3.6` or a newer verified version.
- **Harden the tax-area print view:** HTML-escape user-editable checklist/print values before passing them to `document.write()` to prevent possible script/HTML injection.

Frontend, Docker and functional tests will be run again after these changes.

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
- `reminder-worker` – automatic reminder checks

The backend and database are not exposed directly to the host by default. The frontend is bound locally to `127.0.0.1`.

## Quick start on Windows

### Recommended

1. Install and start Docker Desktop.
2. Clone or update the repository.
3. Double-click `Start.cmd`.
4. Create the first administrator account in the browser.
5. Open maintenance.vik at `http://localhost:3000`.

`Start.cmd` launches `Start.ps1` using an appropriate PowerShell execution policy.

If no local `.env` exists, the start script automatically generates a random PostgreSQL password.

### Start from PowerShell

```powershell
cd "C:\Maintenance.vik\maintenance.vik"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Start.ps1"
```

A direct Docker Compose start is also possible when a valid local `.env` already exists:

```powershell
docker compose up -d --build --wait
```

Check status with:

```powershell
docker compose ps
```

## Users and roles

User administration is handled locally inside maintenance.vik.

### Admin

Administrators can:

- read, create, edit and delete data
- manage users
- export and restore backups
- access protected administration areas

### Viewer

Viewers can read normal application data but cannot perform write operations. Backup, tax and user-management actions are blocked for viewers.

Passwords are not stored in plaintext. Sessions are time-limited and managed server-side.

The older `APP_AUTH_USERS_B64` and `APP_AUTH_PASSWORD` variables remain only as compatibility paths for existing installations.

## Asset condition and system health

maintenance.vik separates the user's manual condition from an automatically calculated system health status.

### Manual condition

Selected by the user:

- Good
- Observe
- Critical

### Automatic system health

The system health considers items such as:

- overdue maintenance
- open defects
- urgent or critical entries
- high-priority tasks
- maintenance due soon

Automatic health does not overwrite the user's manual assessment.

## Finances

The finance area supports:

- income and expenses
- recurring contracts
- monthly and yearly costs
- categories
- asset and component assignment
- filters by asset and sub-area
- monthly totals and balance

It is intended as a personal overview and is not a replacement for full accounting software or professional tax advice.

## Documents and local OCR

Documents can be uploaded, assigned to assets, viewed and downloaded again.

Supported formats include:

- PDF
- PNG
- JPG / JPEG
- WEBP
- TXT
- CSV
- DOCX
- XLSX

Local document analysis can suggest metadata and categories. Suggestions are never applied silently and remain editable before saving.

OCR and PDF text extraction run locally using **Tesseract** and **Poppler**. Document contents are not sent to external AI or OCR services for this process.

## Telegram reminders

Telegram is configured under **Settings & Backup → Integrations → Telegram**.

Available settings include:

- bot token
- activation
- check interval
- connection test
- recipients / chat IDs
- reminder types per recipient

The bot token is stored locally in protected form and is not returned in plaintext after saving.

The `reminder-worker` checks reminders automatically. Telegram is intentionally limited to information required for reminders; sensitive document, tax or financial content should not be sent.

## Backup and restore

maintenance.vik supports ZIP-based application backups with checksum verification.

A backup can be created through the web interface or on Windows using:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '.\scripts\Backup.ps1' -Credential (Get-Credential -UserName 'admin')"
```

If the administrator account uses a different username, enter that username in the credential dialog.

The script:

- exports application data
- validates the backup manifest
- verifies included documents
- creates a SHA-256 checksum
- does not modify or import data

Always keep an additional independently stored backup before a production restore.

Large offline backup helpers are also available:

- `scripts/Backup-Large.ps1`
- `scripts/Verify-LargeBackup.ps1`
- `scripts/Restore-Large.ps1`

## Safe test environment

Destructive restore or browser tests must never run against the normal installation.

Create an isolated test checkout with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Prepare-TestEnvironment.ps1"
```

The script checks, among other things:

- current `main` branch
- clean Git working tree
- an existing verified backup
- stale Docker test containers and volumes
- a separate target directory

Start the test installation using its own Compose project name:

```powershell
cd "C:\Maintenance.vik\maintenance.vik-test"
docker compose -p maintenance-vik-test up -d --build --wait
```

By default it is available at:

```text
http://localhost:3100
```

## Installation using prebuilt Docker images

`docker-compose.release.yml` is intended for installations that should not require a local Node.js or Python build.

```powershell
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Minimum local configuration:

```text
POSTGRES_PASSWORD=<your own strong password>
APP_PORT=3000
```

`MAINTENANCE_VIK_VERSION` can later be used to select a specific release tag.

Example after v1.0.0 is published:

```text
MAINTENANCE_VIK_VERSION=v1.0.0
```

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

For access from other devices, use a protected route such as:

- VPN
- Tailscale or a comparable private network
- HTTPS reverse proxy

Do not expose the database or backend ports directly to the internet.

Secrets such as PostgreSQL passwords or Telegram bot tokens must never be committed to Git or included in public screenshots or support requests.

## License

maintenance.vik is released under the **MIT License**.

The code may be used, modified and redistributed under the terms of the license. The copyright and license notice must be retained.

See [LICENSE](LICENSE).
