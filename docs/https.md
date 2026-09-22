# Optionales HTTPS für LAN oder VPN

Der normale Start bleibt unter `http://localhost:3000` verfügbar. Für Zugriffe von einem anderen Gerät kann zusätzlich Caddy als HTTPS-Reverse-Proxy gestartet werden. Backend und Datenbank werden dadurch nicht veröffentlicht.

## Vorbereitung

In der lokalen `.env` einen Namen setzen, unter dem der Rechner im LAN/VPN erreichbar ist, zum Beispiel:

```text
APP_HOSTNAME=maintenance.home.arpa
HTTPS_PORT=443
```

Der Name muss auf die IP des maintenance.vik-Rechners auflösen. Bei Tailscale kann stattdessen ein passender DNS-/MagicDNS-Name verwendet werden.

## Start

```powershell
docker compose --project-directory "N:\maintenance.vik" -f "N:\maintenance.vik\docker-compose.yml" -f "N:\maintenance.vik\docker-compose.https.yml" up -d --build
```

Danach: `https://<APP_HOSTNAME>/`.

Caddy verwendet `tls internal` und erzeugt eine lokale CA. Browser auf anderen Geräten vertrauen dieser CA nicht automatisch. Für den morgigen Test ist eine Zertifikatswarnung daher erwartbar, bis die Caddy-Root-CA auf dem jeweiligen Testgerät bewusst als vertrauenswürdig installiert wurde. Die Root-CA liegt im Caddy-Datenvolume und darf nur an eigene Geräte verteilt werden.

**Nicht** den HTTP-Port 3000 im LAN freigeben. Der bestehende Compose-Port bleibt an `127.0.0.1` gebunden. Für öffentlichen Internetzugriff ist die interne CA nicht gedacht; dafür einen echten Domainnamen, öffentlich vertrauenswürdiges TLS und zusätzliche Härtung verwenden.

## Stoppen nur des HTTPS-Zusatzes

```powershell
docker compose --project-directory "N:\maintenance.vik" -f "N:\maintenance.vik\docker-compose.yml" -f "N:\maintenance.vik\docker-compose.https.yml" stop caddy
```
