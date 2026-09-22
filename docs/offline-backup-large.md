# Große Offline-Sicherung – separater Weg neben dem 250-MB-ZIP

Das bestehende **Anwendungs-ZIP bleibt unverändert und ist weiter auf 250 MB begrenzt**. `scripts/Backup-Large.ps1` ist ein anderer Sicherungsweg: Frontend und Backend werden kurz angehalten, die weiterhin laufende PostgreSQL-Datenbank wird mit `pg_dump --format=custom` gesichert, anschließend wird das gesamte `/data`-Dokumentenvolume kopiert. Danach versucht das Skript, Frontend und Backend auch bei Fehlern wieder zu starten. Es importiert nichts, löscht keine Volumes und verändert keine bestehenden Datenbanktabellen. Große Dateien werden als Verzeichnis statt als eine im Arbeitsspeicher erzeugte ZIP-Datei gespeichert; freier Speicherplatz auf dem Ziellaufwerk ist erforderlich.

**Nicht während wichtiger Nutzung ausführen:** Die Webanwendung ist für die Dauer der Sicherung nicht erreichbar. Bei einem Fehler ein verbleibendes `.partial`-Verzeichnis aufbewahren, Docker-Status prüfen und nicht blind erneut starten oder Verzeichnisse löschen. Ein fehlerfreier Export und übereinstimmende Prüfsummen beweisen **nicht**, dass ein Restore funktioniert.

Vor dem ersten Einsatz mit echten Daten die Isolationsanleitung `docs/Testplan-2026-09-23.md` befolgen und nur die Testinstanz verwenden:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "N:\maintenance.vik-test\scripts\Backup-Large.ps1" -ComposeProject maintenance-vik-test -Destination "E:\maintenance-vik-test-backups"
```

**Nur wenn die Testkopie auf `N:\maintenance.vik-test` tatsächlich existiert und eigene Testvolumes besitzt.** Den Laufwerksbuchstaben `E:` gegebenenfalls anpassen. Im fertig benannten Sicherungsordner liegen `database.dump`, `data/`, `manifest.json` und `manifest.sha256`. Anschließend rein lesend prüfen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "N:\maintenance.vik-test\scripts\Verify-LargeBackup.ps1" -BackupDirectory "E:\maintenance-vik-test-backups\maintenance-vik-offline-<Zeitstempel>"
```

Der Backup-Ordner **ist nicht** mit `/api/backup/import` kompatibel. Ein Restore benötigt eine **separate, frische PostgreSQL-/Dokumenten-Testinstallation**, `pg_restore` und eine kontrollierte Kopie der `data/`-Dateien. Keinesfalls `pg_restore --clean` gegen die laufende Datenbank oder den bestehenden Dokumentenbestand ausführen. Die tatsächliche Windows-Wiederherstellbarkeit muss vor produktiver Nutzung gesondert nachgewiesen werden. Bei Verwendung einer externen Festplatte sensible Dokumente und Datenbank-Dumps mit geeignetem Zugriffsschutz/Verschlüsselung sichern.
