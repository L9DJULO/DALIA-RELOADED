$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'windows-build-env.ps1')
Push-Location (Join-Path $projectRoot 'client')
try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    npm.cmd test -- --run
    if ($LASTEXITCODE -ne 0) { throw 'Client tests failed' }
    npm.cmd run tauri build
    if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed' }
} finally { Pop-Location }
