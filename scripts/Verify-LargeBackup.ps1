# Nur Lesen: prüft Struktur und SHA256 jeder Datei eines großen Offline-Backups.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$BackupDirectory)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($BackupDirectory).TrimEnd('\', '/')
$manifestPath = Join-Path $root 'manifest.json'
$checksumPath = Join-Path $root 'manifest.sha256'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw 'Manifest oder Prüfsummendatei fehlt.'
}
$expected = (Get-Content -LiteralPath $checksumPath -TotalCount 1).Trim()
if ($expected -cnotmatch '^[0-9a-f]{64}$') { throw 'Manifest-Prüfsumme ungültig.' }
$actual = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -cne $expected) { throw 'Manifest-Prüfsumme stimmt nicht.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -cne 'maintenance.vik-offline' -or $manifest.schema_version -ne 1 -or -not $manifest.files) {
    throw 'Unbekanntes oder unvollständiges Offline-Backup.'
}
$seen = @{}
foreach ($entry in $manifest.files) {
    $relative = [string]$entry.path
    if ($relative -cnotmatch '^(database\.dump|data/[a-zA-Z0-9_./-]+)$' -or $relative -match '(?:^|/)\.\.(?:/|$)') {
        throw "Ungültiger relativer Dateipfad im Manifest: $relative"
    }
    if ($seen.ContainsKey($relative)) { throw "Doppelter Datei-Eintrag: $relative" }
    $seen[$relative] = $true
    $path = Join-Path $root ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Backup-Datei fehlt: $relative" }
    $file = Get-Item -LiteralPath $path
    if ([long]$file.Length -ne [long]$entry.size) { throw "Dateigröße stimmt nicht: $relative" }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -cne [string]$entry.sha256) { throw "Dateiprüfsumme stimmt nicht: $relative" }
}
if (-not $seen.ContainsKey('database.dump')) { throw 'Datenbank-Dump fehlt im Manifest.' }
foreach ($file in (Get-ChildItem -LiteralPath $root -File -Recurse)) {
    $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
    if ($relative -notin @('manifest.json', 'manifest.sha256') -and -not $seen.ContainsKey($relative)) {
        throw "Unerwartete Datei im Backup: $relative"
    }
}
Write-Host "Offline-Backup vollständig geprüft: $root" -ForegroundColor Green
Write-Host "Dateien geprüft: $($seen.Count)"
Write-Warning 'Die Prüfsummen belegen Integrität, nicht die Wiederherstellbarkeit. Restore ausschließlich in einer getrennten Testinstanz prüfen.'
