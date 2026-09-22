# Tests sicher ausführen

## Backend-Tests

Die Backend-Tests verwenden laut `backend/tests/conftest.py` eine temporäre SQLite-Datenbank. Sie sollen **nicht** gegen die PostgreSQL-Datenbank der laufenden Anwendung ausgeführt werden.

## Browser-Tests (Playwright)

Der Test **„Bestand, Wartung, Finanzen, Dokumente und Backup über die Oberfläche“** legt Datensätze an und ruft `/backup/import` auf. Der Import **ersetzt den gesamten Bestand**. Der Test versucht danach, ein zuvor exportiertes Backup wiederherzustellen. Diese Wiederherstellung kann bei einem Fehler ausbleiben; deshalb ist eine produktive oder privat genutzte Instanz niemals ein sicheres Testziel.

Der destruktive Test wird durch `frontend/playwright.config.ts` standardmäßig ausgeschlossen. Andere Browser-Tests können weiterhin laufen. Für den destruktiven Test sind **beide** Umgebungsvariablen erforderlich:

- `TEST_URL`: Adresse einer **eigens dafür angelegten, vollständig isolierten und entbehrlichen** Testinstallation (eigene Docker-Volumes / eigene Datenbank / eigener Dokumentenspeicher).
- `TEST_ALLOW_DESTRUCTIVE=YES_ISOLATED_TEST_DATA`: bewusste Freigabe der Datenersetzung.

**Nie** die laufende maintenance.vik-Installation, deren PostgreSQL-Volume oder deren Dokumenten-Volume als Ziel verwenden. Eine andere Portnummer allein stellt keine Isolation dar. Solange keine isolierte Testinstallation eingerichtet ist, den destruktiven Test nicht freigeben.

Die Schutzschaltung verhindert versehentliches Ausführen über die normale Playwright-Konfiguration; sie ist keine Zugriffskontrolle gegen bewusst geänderte Tests oder CLI-Filter.
