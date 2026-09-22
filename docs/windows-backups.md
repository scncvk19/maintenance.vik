# Geprüfte Windows-Backups

Das Skript `scripts/Backup.ps1` exportiert den vollständigen Anwendungsbestand über die bestehende Backup-API, prüft das ZIP-Manifest und die SHA-256-Prüfsummen aller enthaltenen Dokumente und legt erst danach die fertige ZIP-Datei zusammen mit einer `.sha256`-Datei ab. Es **importiert nichts** und verändert keine Datensätze. Eine beschädigte oder unvollständige Sicherung bleibt nicht als fertiges Backup liegen.

Voraussetzung: Docker Desktop und die laufende Anwendung. In PowerShell im Projektordner:

```powershell
& .\scripts\Backup.ps1
```

Der Standardordner `backups/` liegt auf demselben Laufwerk wie das Projekt und ist daher **kein Schutz vor einem Defekt dieses Laufwerks**. Besser ein anderes Laufwerk wählen, z. B.:

```powershell
& .\scripts\Backup.ps1 -Destination 'E:\maintenance-vik-backups'
```

Die `.sha256`-Datei ermöglicht später eine erneute Prüfung der unveränderten ZIP-Datei. Ein erfolgreicher Export beweist allein noch keine erfolgreiche Wiederherstellung: Dafür regelmäßig auf einer **separaten Testinstallation mit eigenen Datenbank- und Dokumenten-Volumes** einen Restore testen. Niemals den produktiven Datenbestand für Tests importieren. Es gibt aktuell keine automatische Aufbewahrungsregel; alte Sicherungen nur nach bestätigtem Restore-Test entfernen.

Das Anwendungsbackup ist derzeit auf **250 MB** begrenzt. Bei größeren Beständen bricht der Export ab, statt eine scheinbar vollständige Sicherung zu erzeugen. Für größere Archive müssen Export, Upload und Import künftig streamingfähig implementiert werden. Steuerpasswort und Wiederherstellungscode werden nicht in Klartext gesichert; diese Zugangsdaten getrennt sicher verwahren.
