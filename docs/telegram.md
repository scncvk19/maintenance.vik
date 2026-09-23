# Telegram-Erinnerungen

Ab dieser Erweiterung ist `http://localhost:3000/reminders` eine **Vorschauseite**. Sie zeigt nur Anzahlen fälliger Aufgaben (einschließlich Wartungen), Verträge und Dokument-Erinnerungen. Keine Objektnamen, Adressen, Beträge, Steuerinhalte oder Dateinamen werden verschickt. Der Versand bleibt ohne bewusst eingerichteten Bot deaktiviert. Sobald Telegram ausdrücklich aktiviert wurde, prüft ein eigener Docker-Worker standardmäßig stündlich auf fällige Erinnerungen.

## Vorschau ohne Telegram-Konto

Anwendung starten, in der bestehenden Empfängerverwaltung einen Testempfänger anlegen (Kanal Telegram), dann `/reminders` öffnen. Noch ohne Bot-Konfiguration lässt sich die Vorschau prüfen. Die Sendeschaltfläche bleibt deaktiviert. Die Route `/api/notifications/preview` gibt nur Anzahlen und den Konfigurationsstatus zurück.

## Echtes Senden ausdrücklich aktivieren

1. Einen **eigenen** Telegram-Bot und eine private Chat-ID beschaffen. Beides geheim halten, nicht in Git, Chat, Screenshots oder ein Supportticket kopieren. Der Bot erhält Zugriff auf die Chat-Nachrichten, nicht auf deine Steuerakten.
2. In der lokal bereits existierenden und ignorierten `N:\maintenance.vik\.env` ergänzen: `TELEGRAM_BOT_TOKEN=<persönlicher-Bot-Token>` und `TELEGRAM_SEND_ENABLED=YES_I_CONFIGURED_THE_BOT`. Das Standard-Compose übergibt diese Werte nur an das Backend. Die `.env` nicht in ein Backup-Archiv mit öffentlichen Zugriffsrechten oder Git übernehmen.
3. Testempfänger in der bestehenden Empfängerverwaltung mit numerischer Chat-ID eintragen; gewünschte Erinnerungsarten aktivieren. Backend mit `docker compose --project-directory "N:\maintenance.vik" up -d --build backend` neu erstellen (erst **nach** gesichertem Stand und Prüfung der neuen Version).
4. `/reminders` neu öffnen, die Vorschau lesen, Button klicken und zweite Bestätigung ausdrücklich akzeptieren. Für den echten Versand muss der Benutzer zum Test bereit sein. Ohne fällige Testdaten wird nichts gesendet.
5. Manueller und automatischer Versand teilen dieselbe Tages-Deduplizierung: pro Chat-ID maximal eine Nachricht pro Kalendertag; der Hash der Chat-ID wird in `/data/telegram-sent.json` im vorhandenen Dokumentenvolume gespeichert. Keine Bot-Tokens oder Chat-IDs werden in dieser Protokolldatei gespeichert. **Bei fehlgeschlagenem Versand kann eine Teilzustellung erneut versucht werden**; die Telegram-API bietet hier keine garantierte Ende-zu-Ende-Exakt-einmal-Zustellung.

Der aktuelle lokale Basic-Auth-Schutz ist kein persönliches Mehrbenutzer-Login. Nicht öffentlich ins Internet stellen; für externen Zugang HTTPS über einen sauber konfigurierten VPN-/Reverse-Proxy-Weg verwenden. Das Backend ist im Compose nicht direkt am Host veröffentlicht.
