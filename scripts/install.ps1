[CmdletBinding()]
param(
    [ValidatePattern('^(latest|\d+\.\d+\.\d+)$')]
    [string]$Version = 'latest',
    [switch]$Portable,
    [switch]$Interactive
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repository = 'Kitori2137/EyesOfOdin'
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("eyes-of-odin-" + [guid]::NewGuid().ToString('N'))

try {
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    $releaseEndpoint = if ($Version -eq 'latest') {
        "https://api.github.com/repos/$repository/releases/latest"
    } else {
        "https://api.github.com/repos/$repository/releases/tags/v$Version"
    }
    Write-Host 'Eyes of Odin - sprawdzanie najnowszego wydania...' -ForegroundColor Cyan
    $release = Invoke-RestMethod -Uri $releaseEndpoint -Headers @{ 'User-Agent' = 'EyesOfOdin-Updater' }
    $resolvedVersion = [string]$release.tag_name -replace '^v', ''
    if ($resolvedVersion -notmatch '^\d+\.\d+\.\d+$') {
        throw "Wydanie ma nieprawidlowy numer wersji: $($release.tag_name)."
    }
    $tag = "v$resolvedVersion"
    $assetName = if ($Portable) { "Eyes of Odin Portable $resolvedVersion.exe" } else { "Eyes of Odin Setup $resolvedVersion.exe" }
    $installerAsset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    $checksumAsset = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
    if (-not $installerAsset -or -not $checksumAsset) {
        throw "W wydaniu $tag nie znaleziono instalatora albo pliku SHA256SUMS.txt."
    }

    $installerPath = Join-Path $temporaryDirectory $assetName
    $checksumPath = Join-Path $temporaryDirectory 'SHA256SUMS.txt'
    Invoke-WebRequest -Uri $installerAsset.browser_download_url -OutFile $installerPath -Headers @{ 'User-Agent' = 'EyesOfOdin-Updater' }
    Invoke-WebRequest -Uri $checksumAsset.browser_download_url -OutFile $checksumPath -Headers @{ 'User-Agent' = 'EyesOfOdin-Updater' }

    $checksumLine = Get-Content -LiteralPath $checksumPath | Where-Object { $_ -like "*$assetName" } | Select-Object -First 1
    if (-not $checksumLine) { throw "Brak sumy SHA-256 dla pliku $assetName." }
    $expectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($expectedHash -ne $actualHash) { throw 'Suma SHA-256 instalatora jest nieprawidlowa. Plik nie zostanie uruchomiony.' }

    Write-Host 'Suma SHA-256 jest prawidlowa.' -ForegroundColor Green
    if ($Portable) {
        $destination = Join-Path ([Environment]::GetFolderPath('Desktop')) $assetName
        Copy-Item -LiteralPath $installerPath -Destination $destination -Force
        Write-Host "Wersja portable zostala zapisana: $destination" -ForegroundColor Green
    } else {
        Write-Host "Instalowanie najnowszego builda Eyes of Odin $resolvedVersion..." -ForegroundColor Cyan
        $arguments = if ($Interactive) { @() } else { @('/S') }
        $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Instalator zakonczyl dzialanie kodem $($process.ExitCode)." }
        Write-Host "Eyes of Odin $resolvedVersion jest aktualny." -ForegroundColor Green
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
