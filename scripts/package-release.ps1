[CmdletBinding()]
param(
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version = '0.1.0',
    [string]$OutputDirectory,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot "releases\$Version" }
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$resolvedReleases = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'releases'))
if (-not $resolvedOutput.StartsWith($resolvedReleases, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Katalog wydania musi znajdowac sie wewnatrz folderu releases.'
}

Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        pnpm desktop:build
        if ($LASTEXITCODE -ne 0) { throw 'Budowanie aplikacji desktopowej nie powiodlo sie.' }
    }

    $setupSource = Get-ChildItem -Path 'src-tauri\target\release\bundle\nsis' -Filter '*setup.exe' -File |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $portableSource = Get-Item -LiteralPath 'src-tauri\target\release\eyes-of-odin.exe'
    if (-not $setupSource -or -not $portableSource) { throw 'Brak gotowego instalatora lub pliku portable.' }

    New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
    $setupName = "Eyes of Odin Setup $Version.exe"
    $portableName = "Eyes of Odin Portable $Version.exe"
    Copy-Item -LiteralPath $setupSource.FullName -Destination (Join-Path $resolvedOutput $setupName) -Force
    Copy-Item -LiteralPath $portableSource.FullName -Destination (Join-Path $resolvedOutput $portableName) -Force

    $hashLines = foreach ($name in @($setupName, $portableName)) {
        $hash = (Get-FileHash -LiteralPath (Join-Path $resolvedOutput $name) -Algorithm SHA256).Hash
        "$hash  $name"
    }
    Set-Content -LiteralPath (Join-Path $resolvedOutput 'SHA256SUMS.txt') -Value $hashLines -Encoding ascii
    Write-Host "Gotowe wydanie: $resolvedOutput" -ForegroundColor Green
}
finally {
    Pop-Location
}
