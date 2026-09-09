# Configure only this PowerShell process; no machine-wide environment changes.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio Build Tools C++ is required.' }
$vsRoot = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsRoot) { throw 'Install the Desktop development with C++ workload.' }
$toolset = Get-ChildItem -LiteralPath (Join-Path $vsRoot 'VC/Tools/MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$env:PATH = "$($toolset.FullName)/bin/HostX64/x64;$env:PATH"
$env:LIB = "$($toolset.FullName)/lib/x64;$env:LIB"
$env:INCLUDE = "$($toolset.FullName)/include;$env:INCLUDE"
$kitRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$kit = if (Test-Path -LiteralPath "$kitRoot/Lib") { Get-ChildItem -LiteralPath "$kitRoot/Lib" -Directory | Sort-Object Name -Descending | Select-Object -First 1 }
if ($kit -and (Test-Path -LiteralPath "$($kit.FullName)/um/x64/kernel32.lib")) {
    $env:LIB = "$($kit.FullName)/um/x64;$($kit.FullName)/ucrt/x64;$env:LIB"
    $env:INCLUDE = "$kitRoot/Include/$($kit.Name)/um;$kitRoot/Include/$($kit.Name)/shared;$kitRoot/Include/$($kit.Name)/ucrt;$env:INCLUDE"
    $env:PATH = "$kitRoot/bin/$($kit.Name)/x64;$env:PATH"
    $env:WindowsSdkDir = "$kitRoot/"
    $env:WindowsSDKVersion = "$($kit.Name)/"
} else {
    # Optional official NuGet SDK already extracted during local verification.
    $portable = Join-Path $repoRoot '.tools/windows-sdk'
    if (-not (Test-Path -LiteralPath "$portable/microsoft.windows.sdk.cpp.x64/c/um/x64/kernel32.lib")) {
        throw 'Install a Windows 10/11 SDK through Visual Studio Installer, then retry.'
    }
    $includeRoot = Get-ChildItem -LiteralPath "$portable/microsoft.windows.sdk.cpp/c/Include" -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $env:LIB = "$portable/microsoft.windows.sdk.cpp.x64/c/um/x64;$portable/microsoft.windows.sdk.cpp.x64/c/ucrt/x64;$env:LIB"
    $env:INCLUDE = "$($includeRoot.FullName)/um;$($includeRoot.FullName)/shared;$($includeRoot.FullName)/ucrt;$env:INCLUDE"
    $env:PATH = "$portable/microsoft.windows.sdk.cpp/c/bin/$($includeRoot.Name)/x64;$env:PATH"
    $env:WindowsSdkDir = "$portable/microsoft.windows.sdk.cpp/c/"
    $env:WindowsSDKVersion = "$($includeRoot.Name)/"
}
