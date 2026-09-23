# Telegram-Erinnerungen

Telegram wird direkt unter **Einstellungen & Backup → Anbindungen → Telegram** eingerichtet und getestet.

Die Vorschau zeigt nur Anzahlen fälliger Aufgaben/Wartungen, Verträge und Dokument-Erinnerungen. Es werden keine Objektnamen, Adressen, Beträge, Steuerinhalte oder Dateinamen verschickt.

## Einrichtung

1. Einen eigenen Telegram-Bot erstellen und den Bot-Token geheim halten.
2. In maintenance.vik unter **Einstellungen & Backup → Telegram** den Token eintragen.
3. **Verbindung testen** ausführen.
4. Telegram aktivieren und das gewünschte Prüfintervall auswählen.
5. Unter **Benachrichtigungsempfänger** die numerische Chat-ID und die gewünschten Erinnerungstypen hinterlegen.

Der Token wird lokal verschlüsselt gespeichert und nach dem Speichern nicht wieder im Klartext angezeigt.

Die älteren Umgebungsvariablen `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SEND_ENABLED` und `TELEGRAM_CHECK_INTERVAL_SECONDS` bleiben nur als Kompatibilitäts-/Fallbackweg für bestehende Installationen unterstützt.

## Versand testen

In **Einstellungen & Backup → Telegram**:

1. **Vorschau laden**
2. Anzahl aktiver Empfänger und fälliger Einträge prüfen
3. **Jetzt senden** bewusst bestätigen

Der Backend-Endpunkt `/api/notifications/preview` liefert ebenfalls nur Anzahlen und Konfigurationsstatus.

## Automatischer Versand

Der Docker-Dienst `reminder-worker` prüft die gespeicherte Konfiguration regelmäßig. Änderungen am Prüfintervall aus der UI werden ohne Bearbeitung der `.env` übernommen.

Manueller und automatischer Versand teilen dieselbe Tages-Deduplizierung: pro Chat-ID maximal eine Nachricht pro Kalendertag. In der Protokolldatei wird nur ein Hash der Chat-ID gespeichert, nicht die Chat-ID selbst.

Bei fehlgeschlagenem Versand kann eine Teilzustellung erneut versucht werden; die Telegram-API garantiert keine Ende-zu-Ende-Exakt-einmal-Zustellung.

## Sicherheit

Bot-Token und Chat-IDs nicht in Git, öffentliche Screenshots oder Supporttickets kopieren. Das Backend ist im Compose nicht direkt am Host veröffentlicht. Externer Zugriff auf maintenance.vik sollte nur über einen abgesicherten VPN-Zugang oder HTTPS-Reverse-Proxy erfolgen.
