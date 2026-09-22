# Separater großer Sicherungsweg: PostgreSQL-Dump + Dokumentenvolume als Dateien.
# Keine Datenbankänderungen, kein Restore, niemals docker compose down -v.
# Während der Kopie werden Frontend und Backend angehalten und im finally neu gestartet.
[CmdletBinding()]
param(
    [string]$Destination = '',
    [string]$ComposeProject = 'maintenance-vik'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path $project 'backups-large' }
if ($ComposeProject -cnotmatch '^[a-z0-9][a-z0-9_-]{0,50}$') { throw 'Ungültiger Docker-Compose-Projektname.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI nicht gefunden.' }
$compose = @('compose', '--project-directory', $project, '-p', $ComposeProject)
$databaseId = (& docker @compose ps --status running -q database | Out-String).Trim()
$backendId = (& docker @compose ps --status running -q backend | Out-String).Trim()
$frontendId = (& docker @compose ps --status running -q frontend | Out-String).Trim()
if (-not $databaseId -or -not $backendId -or -not $frontendId) {
    throw 'Datenbank, Backend und Frontend müssen vor Beginn laufen. Kein Dienst wurde angehalten.'
}
$root = [IO.Path]::GetFullPath($Destination)
[IO.Directory]::CreateDirectory($root) | Out-Null
$name = 'maintenance-vik-offline-{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$stage = Join-Path $root ('.' + $name + '.partial')
$final = Join-Path $root $name
if ((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $final)) { throw 'Backup-Ziel existiert bereits.' }
[IO.Directory]::CreateDirectory($stage) | Out-Null
$containerDump = '/tmp/maintenance-vik-' + [guid]::NewGuid().ToString('N') + '.dump'
$paused = $false
$restartFailed = $false
try {
    # Keine App-Schreibzugriffe während Dump und Dokumentenkopie.
    $paused = $true
    & docker @compose stop frontend backend
    if ($LASTEXITCODE -ne 0) { throw 'Anhalten der Anwendung fehlgeschlagen. Dienste werden wieder gestartet.' }
    & docker exec $databaseId pg_dump -U maintenance -d maintenance --format=custom --file $containerDump
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL-Dump fehlgeschlagen.' }
    & docker exec $databaseId pg_restore --list $containerDump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL-Dump konnte nicht gelesen werden.' }
    $dumpFile = Join-Path $stage 'database.dump'
    & docker cp "${databaseId}:$containerDump" $dumpFile
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpFile)) { throw 'PostgreSQL-Dump konnte nicht kopiert werden.' }
    $dataDir = Join-Path $stage 'data'
    [IO.Directory]::CreateDirectory($dataDir) | Out-Null
    & docker cp "${backendId}:/data/." $dataDir
    if ($LASTEXITCODE -ne 0) { throw 'Dokumentenvolume konnte nicht kopiert werden.' }

    # Jede kopierte Datei wird separat geprüft. Kein künstliches 250-MB-Limit.
    $entries = @()
    foreach ($file in (Get-ChildItem -LiteralPath $stage -File -Recurse)) {
        $relative = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
        $entries += [pscustomobject]@{
            path = $relative
            size = [long]$file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    if (-not (Test-Path -LiteralPath $dumpFile) -or $entries.Count -lt 1) { throw 'Backup unvollständig.' }
    $manifest = [ordered]@{
        format = 'maintenance.vik-offline'
        schema_version = 1
        created_at_utc = [DateTime]::UtcNow.ToString('o')
        compose_project = $ComposeProject
        files = $entries
    }
    $manifestPath = Join-Path $stage 'manifest.json'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), $utf8)
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $stage 'manifest.sha256'), $manifestHash + [Environment]::NewLine, [Text.Encoding]::ASCII)
}
finally {
    & docker exec $databaseId rm -f $containerDump 2>$null
    if ($paused) {
        & docker @compose start backend frontend
        if ($LASTEXITCODE -ne 0) {
            $restartFailed = $true
            Write-Warning 'KRITISCH: Anwendungsstart fehlgeschlagen. Bitte Docker-Status sofort prüfen.'
        }
    }
}
if ($restartFailed) { throw 'Sicherung wurde erstellt, aber die Anwendung konnte nicht wieder gestartet werden. Teilverzeichnis prüfen.' }
Move-Item -LiteralPath $stage -Destination $final -ErrorAction Stop
Write-Host "Große Sicherung erstellt: $final" -ForegroundColor Green
Write-Host 'Enthält database.dump, data/, manifest.json und manifest.sha256. Noch kein Restore-Nachweis.'
if ([IO.Path]::GetPathRoot($root) -ieq [IO.Path]::GetPathRoot($project)) {
    Write-Warning 'Sicherung liegt auf demselben Laufwerk. Zusätzlich auf einen unabhängigen Datenträger kopieren.'
}
