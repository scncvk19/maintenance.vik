[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,80}$')][string]$UserName,
    [ValidateSet('admin','viewer')][string]$Role = 'viewer',
    [SecureString]$Password,
    [string]$ProjectDirectory = ''
)
$ErrorActionPreference = 'Stop'
if (-not $ProjectDirectory) { $ProjectDirectory = Split-Path -Parent $PSScriptRoot }
$project = [IO.Path]::GetFullPath($ProjectDirectory)
$envPath = Join-Path $project '.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw '.env fehlt. Anwendung zuerst einmal starten.' }
if ($null -eq $Password) {
    $Password = Read-Host "Passwort für $UserName" -AsSecureString
    $repeat = Read-Host 'Passwort wiederholen' -AsSecureString
    $a = [Net.NetworkCredential]::new('', $Password).Password
    $b = [Net.NetworkCredential]::new('', $repeat).Password
    if ($a -cne $b) { throw 'Passwörter stimmen nicht überein.' }
}
$plain = [Net.NetworkCredential]::new('', $Password).Password
if ($plain.Length -lt 12) { throw 'Passwort muss mindestens 12 Zeichen lang sein.' }

$lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $envPath)
function Get-Value([string]$Name) {
    $prefix = $Name + '='
    $line = $lines | Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) } | Select-Object -Last 1
    if ($line) { return $line.Substring($prefix.Length) }
    return ''
}
function Set-Value([string]$Name, [string]$Value) {
    $prefix = $Name + '='
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        if ($lines[$i].StartsWith($prefix, [StringComparison]::Ordinal)) { $lines.RemoveAt($i) }
    }
    $lines.Add($prefix + $Value)
}

$encoded = Get-Value 'APP_AUTH_USERS_B64'
$users = @()
if ($encoded) {
    try {
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
        $users = @($json | ConvertFrom-Json)
    } catch { throw 'Vorhandene APP_AUTH_USERS_B64 ist ungültig; nichts wurde geändert.' }
}

$salt = New-Object byte[] 16
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($salt) } finally { $rng.Dispose() }
try {
    $derive = New-Object Security.Cryptography.Rfc2898DeriveBytes($plain, $salt, 310000, [Security.Cryptography.HashAlgorithmName]::SHA256)
} catch {
    throw 'PBKDF2-SHA256 wird von dieser PowerShell/.NET-Version nicht unterstützt. PowerShell 7 verwenden.'
}
try { $hash = $derive.GetBytes(32) } finally { $derive.Dispose() }
$record = [pscustomobject]@{
    username = $UserName
    role = $Role
    salt = ([BitConverter]::ToString($salt).Replace('-', '').ToLowerInvariant())
    hash = ([BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
}
$users = @($users | Where-Object { $_.username -cne $UserName }) + @($record)
$jsonOut = $users | ConvertTo-Json -Compress
Set-Value 'APP_AUTH_USERS_B64' ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($jsonOut)))

if (-not (Get-Value 'APP_SESSION_SECRET')) {
    $secretBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
    Set-Value 'APP_SESSION_SECRET' ([BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant())
}

[IO.File]::WriteAllLines($envPath, $lines, (New-Object Text.UTF8Encoding($false)))
$plain = $null
Write-Host "Benutzer '$UserName' ($Role) gespeichert." -ForegroundColor Green
Write-Host 'Container neu erstellen, damit die Anmeldung aktiv wird: docker compose up -d --build'
