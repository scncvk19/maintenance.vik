# maintenance.vik

Lokale Webanwendung für Immobilien, Fahrzeuge, technische Anlagen, Termine und geschützte Steuerfälle.

## Start unter Windows

1. Docker Desktop starten.
2. `Start.cmd` doppelklicken.
3. Die Anwendung öffnet sich unter `http://localhost:3000`.

Beim ersten Start erzeugt die Anwendung eine lokale `.env`-Datei mit einem zufälligen Datenbankpasswort. Diese Datei, die Datenbank und hochgeladene Dokumente bleiben lokal und werden nicht in Git übernommen.

## Lokale Benutzerkonten (empfohlen)

maintenance.vik kann mehrere lokale Konten mit den Rollen **admin** und **viewer** verwenden. Passwörter werden als PBKDF2-SHA256-Hash mit zufälligem Salt in der lokalen `.env` gespeichert; Klartextpasswörter werden nicht gespeichert. Sitzungen laufen über signierte HttpOnly-Cookies und enden nach 12 Stunden.

Benutzer anlegen oder aktualisieren:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "N:\maintenance.vik\scripts\Set-AppUser.ps1" -UserName sercan -Role admin
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "N:\maintenance.vik\scripts\Set-AppUser.ps1" -UserName leser -Role viewer
```

Danach Container neu erstellen:

```powershell
docker compose --project-directory "N:\maintenance.vik" up -d --build
```

Anmeldung erfolgt anschließend unter `/login`. **admin** darf lesen und ändern. **viewer** darf normale Daten lesen, aber keine Änderungen, Backups oder Steuerbereiche aufrufen. Abmelden: `/logout`.

Die Kontenfunktion hat Vorrang vor dem älteren `APP_AUTH_PASSWORD`. Wenn keine lokalen Konten konfiguriert sind, bleibt der bisherige optionale Basic-Auth-Modus kompatibel.

## Optionaler Zugriffsschutz (ein Benutzer)

Die Anwendung ist standardmäßig nur an `127.0.0.1` gebunden. Für einen zusätzlichen Passwortschutz `APP_AUTH_PASSWORD=` mit einem **eigenen, langen Passwort** in die lokale `.env` eintragen (ohne Anführungszeichen, keine Zeilenumbrüche) und die Container neu erstellen:

```powershell
docker compose --project-directory 'N:\maintenance.vik' up -d --build
```

Danach fragt der Browser nach Benutzername `admin` und dem gesetzten Passwort. Der Schutz gilt auch für die API und den Backup-Export. **Es handelt sich noch nicht um eine Mehrbenutzerverwaltung:** keine Rollen, kein Passwort-Reset und kein separates Logout. Bei Vergessen des Passworts lässt es sich in der lokalen `.env` ändern. Die `.env` niemals in Git übernehmen oder weitergeben.

Der integrierte Webserver ist für `localhost` vorgesehen. Für Zugriff von anderen Geräten nur einen abgesicherten VPN-Zugang oder einen **HTTPS**-Reverse-Proxy verwenden: HTTP Basic sendet die Zugangsdaten bei jeder Anfrage und ist über unverschlüsseltes HTTP im Netzwerk nicht sicher. Die Datenbank und den Backend-Port nicht separat veröffentlichen.

Mit aktiviertem Passwortschutz benötigt das Backupskript Zugangsdaten. Diese interaktiv statt im Befehl als Klartext eingeben:

```powershell
$credential = Get-Credential -UserName admin
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'N:\maintenance.vik\scripts\Backup.ps1' -Credential $credential
```

Ohne `APP_AUTH_PASSWORD` bleibt das bisherige lokale Verhalten bestehen. Für einen späteren Mehrbenutzerbetrieb sind serverseitige Authentifizierung, Rollen und Session-Verwaltung weiterhin offen.

## Lokale Dokumentanalyse / OCR

PDFs, Bilder, TXT, CSV und DOCX können direkt in der Dokumentenübersicht mit **Lokal analysieren** ausgewertet werden. OCR läuft ausschließlich im Backend-Container mit Tesseract/Poppler; Dokumentinhalte werden nicht an Cloud-Dienste gesendet. Ein erkannter Kategorienvorschlag wird erst nach ausdrücklicher Bestätigung gespeichert.

## Telegram-Erinnerungen

Telegram ist standardmäßig **deaktiviert**. Für einen Test einen eigenen Bot bei Telegram erstellen und in der lokalen `.env` ergänzen:

```text
TELEGRAM_BOT_TOKEN=<dein Bot-Token>
TELEGRAM_SEND_ENABLED=YES_I_CONFIGURED_THE_BOT
```

Danach die Container neu erstellen. In **Einstellungen & Backup → Telegram** zuerst die Vorschau laden. Der Versand überträgt nur Anzahlen fälliger Aufgaben/Wartungen, Verträge und Dokumenterinnerungen; keine Titel, Adressen, Beträge oder Steuerinhalte. Doppelte Sendungen an denselben Chat werden pro Kalendertag unterdrückt.

## Optionaler WhatsApp-Kanal

Ein datensparsamer WhatsApp-Cloud-API-Kanal ist optional verfügbar und standardmäßig deaktiviert. Er verwendet ein freigegebenes Template und überträgt nur Erinnerungsanzahlen. Einrichtung: `docs/whatsapp.md`.

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
