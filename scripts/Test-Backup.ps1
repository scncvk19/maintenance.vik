# Isolated runtime smoke test: neither Docker nor the network is accessed.
$ErrorActionPreference = 'Stop'
$backupScript = Join-Path $PSScriptRoot 'Backup.ps1'
$destination = Join-Path ([IO.Path]::GetTempPath()) ('maintenance-vik-backup-test-' + [guid]::NewGuid().ToString('N'))
$script:lastRequest = $null

function docker {
    $global:LASTEXITCODE = 0
    return '127.0.0.1:65535'
}
function Invoke-WebRequest {
    param($Uri, $OutFile, $UseBasicParsing, $TimeoutSec, $Headers)
    $script:lastRequest = @{ Uri = $Uri; OutFile = $OutFile; Headers = $Headers }
    throw 'MOCK_BACKUP_REQUEST_REACHED'
}
function Assert-MockedRequest {
    param([scriptblock]$Action)
    $script:lastRequest = $null
    try { & $Action; throw 'Backup test did not reach mocked request.' }
    catch {
        if ($_.Exception.Message -ne 'MOCK_BACKUP_REQUEST_REACHED') { throw }
    }
    if ($null -eq $script:lastRequest) { throw 'No request captured.' }
    if ($script:lastRequest.Uri -ne 'http://127.0.0.1:65535/api/backup/export') { throw 'Unexpected URL.' }
    if (-not $script:lastRequest.OutFile.StartsWith($destination, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backup destination was not resolved correctly.'
    }
}
try {
    Assert-MockedRequest { & $backupScript -Destination $destination }
    if ($script:lastRequest.Headers) { throw 'Anonymous backup unexpectedly added authorization.' }

    $password = ConvertTo-SecureString 'only-ci-test' -AsPlainText -Force
    $credential = [Management.Automation.PSCredential]::new('admin', $password)
    Assert-MockedRequest { & $backupScript -Destination $destination -Credential $credential }
    $expected = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin:only-ci-test'))
    if ($script:lastRequest.Headers.Authorization -cne $expected) { throw 'Credential header is incorrect.' }
    Write-Host 'Backup runtime smoke test passed (destination, anonymous and authenticated requests).'
}
finally {
    Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
}
