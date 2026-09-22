# Exportiert und prueft ein Backup, ohne Daten in der Anwendung zu veraendern.
# Windows PowerShell 5.1 und PowerShell 7; keine zusaetzlichen Module.
[CmdletBinding()]
param(
    [string]$Destination = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups')
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$temporary = $null
$archive = $null
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI wurde nicht gefunden.'
    }
    $mapping = & docker compose --project-directory $project port frontend 3000 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Frontend-Port konnte nicht ermittelt werden: $mapping" }
    $portLine = ($mapping | Out-String).Trim()
    if ($portLine -notmatch ':(\d+)\s*$') { throw "Unerwartete Portausgabe: $portLine" }
    $port = [int]$Matches[1]
    if ($port -lt 1 -or $port -gt 65535) { throw 'Ungueltiger Frontend-Port.' }

    $target = [System.IO.Path]::GetFullPath($Destination)
    [System.IO.Directory]::CreateDirectory($target) | Out-Null
    $name = 'maintenance-vik-{0}-{1}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $final = Join-Path $target $name
    $temporary = Join-Path $target ('.' + $name + '.partial')
    $uri = 'http://127.0.0.1:{0}/api/backup/export' -f $port
    Invoke-WebRequest -Uri $uri -OutFile $temporary -UseBasicParsing -TimeoutSec 180 | Out-Null
    if ((Get-Item -LiteralPath $temporary).Length -eq 0) { throw 'Backup ist leer.' }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($temporary)
    $manifestEntry = $archive.GetEntry('manifest.json')
    if ($null -eq $manifestEntry -or $manifestEntry.Length -gt 20MB) { throw 'Backup-Manifest fehlt oder ist zu gross.' }
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
    finally { $reader.Dispose() }
    if ($manifest.application -ne 'maintenance.vik' -or $manifest.schema_version -ne 1) {
        throw 'Unbekanntes Backup-Format oder Schema.'
    }
    if ($null -eq $manifest.data -or $null -eq $manifest.data.documents) { throw 'Dokumentenliste fehlt.' }
    $keys = @{}
    foreach ($doc in $manifest.data.documents) {
        $key = [string]$doc.storage_key
        if ($key -cnotmatch '^[0-9a-f]{64}$' -or $key -cne [string]$doc.sha256) {
            throw 'Ungueltiger Dateischluessel im Manifest.'
        }
        if ($keys.ContainsKey($key)) { continue }
        $entry = $archive.GetEntry('uploads/' + $key)
        if ($null -eq $entry -or $entry.Length -ne [long]$doc.size) {
            throw "Dokument fehlt oder hat eine falsche Groesse: $key"
        }
        $stream = $entry.Open()
        try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose() }
        if ($digest -cne $key) { throw "Dokument-Pruefsumme stimmt nicht: $key" }
        $keys[$key] = $true
    }
    if ($archive.Entries.Count -ne ($keys.Count + 1)) { throw 'Unerwartete oder doppelte ZIP-Eintraege.' }
    $archive.Dispose()
    $archive = $null
    $shaFile = $final + '.sha256'
    $checksum = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $temporary -Destination $final -ErrorAction Stop
    $temporary = $null
    [System.IO.File]::WriteAllText($shaFile, ($checksum + '  ' + $name + [Environment]::NewLine), [System.Text.Encoding]::ASCII)
    Write-Host "Backup geprueft: $final" -ForegroundColor Green
    Write-Host "SHA-256: $checksum"
    if ($target -eq (Join-Path $project 'backups')) {
        Write-Warning 'Die Sicherung liegt auf demselben Laufwerk wie das Projekt. Fuer echten Ausfallschutz zusaetzlich auf einem anderen Datentraeger sichern.'
    }
}
finally {
    if ($null -ne $archive) { $archive.Dispose() }
    $sha.Dispose()
    if ($temporary -and (Test-Path -LiteralPath $temporary)) { Remove-Item -LiteralPath $temporary -Force }
}
