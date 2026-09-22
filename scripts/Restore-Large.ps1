# Destruktiver Restore eines großen Offline-Backups – ausschließlich für getrennte Testprojekte.
# Das normale Compose-Projekt "maintenance-vik" wird absichtlich verweigert.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [string]$ComposeProject = 'maintenance-vik-test',
    [ValidateSet('RESTORE_ISOLATED_TEST')][string]$Confirmation = ''
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if ($Confirmation -cne 'RESTORE_ISOLATED_TEST') {
    throw 'Restore nicht bestätigt. -Confirmation RESTORE_ISOLATED_TEST ist erforderlich.'
}
if ($ComposeProject -ceq 'maintenance-vik' -or $ComposeProject -cnotmatch '^[a-z0-9][a-z0-9_-]{0,45}-test$') {
    throw 'Sicherheitsstopp: Restore ist nur für einen separaten Compose-Projektnamen mit Suffix -test erlaubt.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI nicht gefunden.' }

$backup = [IO.Path]::GetFullPath($BackupDirectory)
$verify = Join-Path $PSScriptRoot 'Verify-LargeBackup.ps1'
& $verify -BackupDirectory $backup

$compose = @('compose', '--project-directory', $project, '-p', $ComposeProject)
$databaseId = (& docker @compose ps --status running -q database | Out-String).Trim()
$backendId = (& docker @compose ps -q backend | Out-String).Trim()
$frontendId = (& docker @compose ps -q frontend | Out-String).Trim()
if (-not $databaseId -or -not $backendId -or -not $frontendId) {
    throw 'Test-Datenbank, Backend und Frontend müssen bereits als separates Testprojekt existieren.'
}

foreach ($id in @($databaseId, $backendId, $frontendId)) {
    $label = (& docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' $id | Out-String).Trim()
    if ($label -cne $ComposeProject) { throw "Container $id gehört nicht zum Testprojekt $ComposeProject." }
}

$dump = Join-Path $backup 'database.dump'
$data = Join-Path $backup 'data'
if (-not (Test-Path -LiteralPath $dump -PathType Leaf) -or -not (Test-Path -LiteralPath $data -PathType Container)) {
    throw 'database.dump oder data/-Verzeichnis fehlt.'
}

$containerDump = '/tmp/maintenance-vik-restore-' + [guid]::NewGuid().ToString('N') + '.dump'
$frontendStopped = $false
$backendStopped = $false
try {
    Write-Host 'Stoppe ausschließlich Frontend und Backend der TESTINSTANZ ...' -ForegroundColor Yellow
    & docker @compose stop frontend backend
    if ($LASTEXITCODE -ne 0) { throw 'Testanwendung konnte nicht angehalten werden.' }
    $frontendStopped = $true
    $backendStopped = $true

    & docker cp $dump ("${databaseId}:" + $containerDump)
    if ($LASTEXITCODE -ne 0) { throw 'Datenbank-Dump konnte nicht in den Testcontainer kopiert werden.' }

    & docker exec $databaseId pg_restore --list $containerDump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Datenbank-Dump ist für pg_restore nicht lesbar.' }

    Write-Host 'Ersetze ausschließlich die TEST-Datenbank ...' -ForegroundColor Yellow
    & docker exec $databaseId pg_restore -U maintenance -d maintenance --clean --if-exists --no-owner --no-privileges $containerDump
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL-Restore fehlgeschlagen.' }

    Write-Host 'Leere ausschließlich das Dokumentenvolume der TESTINSTANZ ...' -ForegroundColor Yellow
    & docker @compose run --rm --no-deps backend sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
    if ($LASTEXITCODE -ne 0) { throw 'Test-Dokumentenvolume konnte nicht geleert werden.' }

    & docker cp ((Join-Path $data '.') ) ("${backendId}:/data")
    if ($LASTEXITCODE -ne 0) { throw 'Dokumente konnten nicht in das Testvolume kopiert werden.' }

    & docker exec $databaseId rm -f $containerDump 2>$null | Out-Null

    Write-Host 'Starte TEST-Backend und TEST-Frontend ...' -ForegroundColor Yellow
    & docker @compose start backend frontend
    if ($LASTEXITCODE -ne 0) { throw 'Testanwendung konnte nach Restore nicht gestartet werden.' }
    $backendStopped = $false
    $frontendStopped = $false

    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 2
        $state = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $backendId | Out-String).Trim()
        if ($state -eq 'healthy') { $healthy = $true; break }
        if ($state -eq 'unhealthy' -or $state -eq 'exited') { break }
    }
    if (-not $healthy) { throw 'Backend der Testinstanz wurde nach Restore nicht healthy.' }

    Write-Host "Großbackup erfolgreich in TESTINSTANZ wiederhergestellt: $ComposeProject" -ForegroundColor Green
    Write-Host 'Produktivprojekt maintenance-vik wurde durch Sicherheitsprüfungen ausgeschlossen.'
}
finally {
    try { & docker exec $databaseId rm -f $containerDump 2>$null | Out-Null } catch {}
    if ($backendStopped -or $frontendStopped) {
        Write-Warning 'Restore wurde abgebrochen. Es wird versucht, die TESTINSTANZ wieder zu starten.'
        try { & docker @compose start backend frontend | Out-Null } catch {}
    }
}
