# Bereitet eine getrennte Testinstallation vor; startet Docker nicht und importiert nichts.
[CmdletBinding()]
param([string]$Target = '')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if (-not $Target) { $Target = Join-Path (Split-Path -Parent $project) 'maintenance.vik-test' }
$targetPath = [IO.Path]::GetFullPath($Target)
$projectPath = [IO.Path]::GetFullPath($project)
if ($targetPath.TrimEnd('\', '/') -ieq $projectPath.TrimEnd('\', '/')) { throw 'Das Testziel darf nicht der Projektordner sein.' }
if (Test-Path -LiteralPath $targetPath) { throw "Testziel existiert bereits; keine Dateien werden überschrieben: $targetPath" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git fehlt.' }
$branch = (& git -C $projectPath branch --show-current | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw 'Bitte zuerst den Hauptbranch main auschecken.' }
$changes = (& git -C $projectPath status --porcelain | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Lokale Änderungen vorhanden; nicht automatisch kopieren. Bitte Git-Status prüfen.' }
$backupDirectory = Join-Path $projectPath 'backups'
$backup = Get-ChildItem -LiteralPath $backupDirectory -Filter '*.zip' -File -ErrorAction Stop |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backup) { throw 'Keine Backup-ZIP gefunden; Testumgebung nicht angelegt.' }
$checksumPath = $backup.FullName + '.sha256'
if (-not (Test-Path -LiteralPath $checksumPath)) { throw 'Backup-Prüfsumme fehlt; Testumgebung nicht angelegt.' }
$checksumLine = (Get-Content -LiteralPath $checksumPath -TotalCount 1).Trim()
$expected = ($checksumLine -split '\s+')[0]
if ($expected -notmatch '^[0-9a-fA-F]{64}$') { throw 'Backup-Prüfsumme ist ungültig.' }
$actual = (Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash
if ($actual -ine $expected) { throw 'Backup-Prüfsumme stimmt nicht. Vorgang abgebrochen.' }
Write-Host "Backup-Prüfsumme bestätigt: $($backup.Name)" -ForegroundColor Green
& git clone --no-hardlinks --single-branch --branch main $projectPath $targetPath
if ($LASTEXITCODE -ne 0) { throw 'Kopie fehlgeschlagen; vorhandenes Testziel prüfen, nicht blind löschen.' }
$secretBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
$secret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
$envPath = Join-Path $targetPath '.env'
if (Test-Path -LiteralPath $envPath) { throw 'Unerwartete .env im Test-Checkout; nicht überschrieben.' }
[IO.File]::WriteAllText($envPath, "POSTGRES_PASSWORD=$secret`nAPP_PORT=3100`n", [Text.Encoding]::ASCII)
Write-Host "Separate Testdateien angelegt: $targetPath" -ForegroundColor Green
Write-Host 'Testcontainer wurden NICHT gestartet. Im Testordner später: docker compose -p maintenance-vik-test up -d --build --wait'
Write-Warning 'ZIP und .sha256 zusätzlich auf ein anderes Laufwerk kopieren. Niemals Backup-Import auf der Produktivinstanz testen.'
