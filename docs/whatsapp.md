# WhatsApp Cloud API – optionaler Erinnerungskanal

Der Kanal ist standardmäßig deaktiviert. maintenance.vik nutzt ausschließlich ein **vorher in Meta eingerichtetes Template** und überträgt nur drei Zahlen: fällige Aufgaben/Wartungen, Vertragsenden und Dokumenterinnerungen. Titel, Adressen, Beträge, Dokumentinhalte und Steuerdaten werden nicht versendet.

Benötigte Werte in der lokalen `.env`:

```text
WHATSAPP_ACCESS_TOKEN=<System-User-Token>
WHATSAPP_PHONE_NUMBER_ID=<Phone-Number-ID>
WHATSAPP_GRAPH_VERSION=<von Meta aktuell unterstützte Version, z.B. vXX.X>
WHATSAPP_TEMPLATE_NAME=<genehmigter Template-Name>
WHATSAPP_TEMPLATE_LANGUAGE=de
WHATSAPP_SEND_ENABLED=YES_I_CONFIGURED_WHATSAPP
```

Das Template braucht drei Body-Textparameter in dieser Reihenfolge:

1. Aufgaben/Wartungen
2. Vertragsenden
3. Dokumenterinnerungen

Beispieltext im Template: `maintenance.vik: {{1}} Aufgaben/Wartungen, {{2}} Vertragsenden, {{3}} Dokumenterinnerungen. Details lokal öffnen.`

Empfänger werden in den Einstellungen als WhatsApp-Rufnummern im internationalen Format hinterlegt, z.B. `+4179...`.

Der Versand muss zusätzlich pro Aufruf mit dem internen Bestätigungsheader freigegeben werden. Pro Empfänger wird höchstens einmal pro Kalendertag gesendet; die Rufnummer selbst wird nicht im Deduplizierungsprotokoll gespeichert.

**Morgen praktisch testen:** zuerst mit einem Meta-Testkonto/Testempfänger. Ein erfolgreicher Stub-Test in CI bestätigt nur maintenance.vik-Logik, nicht Provider-Freigaben, Template-Genehmigung oder das reale Meta-Konto.
