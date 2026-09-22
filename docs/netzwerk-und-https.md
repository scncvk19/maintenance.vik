# Netzwerkzugriff und HTTPS

maintenance.vik veröffentlicht den Frontend-Port standardmäßig nur auf `127.0.0.1`. Damit ist die Anwendung ohne weitere Konfiguration nicht direkt aus dem LAN oder Internet erreichbar.

## Empfohlener Betrieb

1. Für einen einzelnen Rechner den Standard `127.0.0.1:3000` beibehalten.
2. Für entfernten Zugriff bevorzugt ein privates Overlay-Netz wie Tailscale/WireGuard verwenden.
3. Wenn die Anwendung über einen Hostnamen im LAN oder darüber hinaus bereitgestellt wird, einen Reverse Proxy mit TLS davor setzen (z. B. Caddy, Traefik oder nginx).
4. Nur den Reverse Proxy veröffentlichen. Backend und PostgreSQL bleiben ausschließlich im Docker-Netz.
5. Mehrbenutzer-Anmeldung mit `Setup-Users.ps1` aktivieren; keine gemeinsame Basic-Auth für mehrere Personen verwenden.
6. `APP_SESSION_SECRET` nicht teilen und nicht ins Git-Repository einchecken.

## Sitzungen

Die Mehrbenutzer-Anmeldung verwendet signierte HttpOnly-Cookies, SameSite=Lax und einen Ablauf von 12 Stunden. Bei HTTPS setzt die Login-Route automatisch das Secure-Attribut. Leser dürfen keine schreibenden API-Aufrufe, Backups oder Steuerbereiche verwenden.

## Grenzen

maintenance.vik bringt bewusst keinen öffentlichen TLS-Endpunkt mit. Zertifikate, DNS und Portfreigaben gehören in die Infrastruktur vor der Anwendung. Eine direkte Internet-Portfreigabe auf Port 3000 ist nicht vorgesehen.

Für den morgigen lokalen Test ist HTTPS nicht erforderlich. Für LAN/VPN-Tests genügt ein privater Tunnel; für öffentliche Erreichbarkeit ist TLS Pflicht.
