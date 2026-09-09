$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env')) {
    $secretBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($secretBytes)
    $rng.Dispose()
    $secret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), "POSTGRES_PASSWORD=$secret`nAPP_PORT=3000`n")
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) { Start-Process -FilePath $desktop -WindowStyle Hidden }
    Write-Host 'Docker wird gestartet ...'
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 2
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Docker ist nicht bereit. Bitte Docker Desktop / WSL prüfen.' }
}
docker compose up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Anwendungsstart fehlgeschlagen. Details stehen in der Docker-Ausgabe.' }
$portLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^APP_PORT=' } | Select-Object -First 1
$appPort = if ($portLine) { $portLine.Substring(9) } else { '3000' }
Start-Process "http://localhost:$appPort"
