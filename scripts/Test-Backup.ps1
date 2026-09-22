# Isolated runtime smoke test: neither Docker nor the network is accessed.
$ErrorActionPreference = 'Stop'
$backupScript = Join-Path $PSScriptRoot 'Backup.ps1'
$destination = Join-Path ([IO.Path]::GetTempPath()) ('maintenance-vik-backup-test-' + [guid]::NewGuid().ToString('N'))
$defaultDestination = Join-Path (Split-Path -Parent $PSScriptRoot) 'backups'
$global:lastBackupTestRequest = $null

function docker {
    $global:LASTEXITCODE = 0
    return '127.0.0.1:65535'
}
function Invoke-WebRequest {
    param($Uri, $OutFile, $UseBasicParsing, $TimeoutSec, $Headers)
    $global:lastBackupTestRequest = @{ Uri = $Uri; OutFile = $OutFile; Headers = $Headers }
    throw 'MOCK_BACKUP_REQUEST_REACHED'
}
function Assert-MockedRequest {
    param([scriptblock]$Action, [string]$ExpectedDirectory)
    $global:lastBackupTestRequest = $null
    try { & $Action; throw 'Backup test did not reach mocked request.' }
    catch {
        if ($_.Exception.Message -ne 'MOCK_BACKUP_REQUEST_REACHED') { throw }
    }
    if ($null -eq $global:lastBackupTestRequest) { throw 'No request captured.' }
    if ($global:lastBackupTestRequest.Uri -ne 'http://127.0.0.1:65535/api/backup/export') { throw 'Unexpected URL.' }
    $expectedPrefix = [IO.Path]::GetFullPath($ExpectedDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $global:lastBackupTestRequest.OutFile.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backup destination was not resolved correctly.'
    }
}
try {
    Assert-MockedRequest -Action { & $backupScript } -ExpectedDirectory $defaultDestination
    if ($global:lastBackupTestRequest.Headers) { throw 'Anonymous backup unexpectedly added authorization.' }

    $password = ConvertTo-SecureString 'only-ci-test' -AsPlainText -Force
    $credential = [Management.Automation.PSCredential]::new('admin', $password)
    Assert-MockedRequest -Action { & $backupScript -Destination $destination -Credential $credential } -ExpectedDirectory $destination
    $expected = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin:only-ci-test'))
    if ($global:lastBackupTestRequest.Headers.Authorization -cne $expected) { throw 'Credential header is incorrect.' }
    Write-Host 'Backup runtime smoke test passed (default destination, anonymous and authenticated requests).'
}
finally {
    Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Variable -Name lastBackupTestRequest -Scope Global -ErrorAction SilentlyContinue
}
