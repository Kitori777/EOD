[CmdletBinding()]
param([switch]$SkipRust)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
    pnpm typecheck
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript typecheck zakonczyl sie bledem.' }
    pnpm lint
    if ($LASTEXITCODE -ne 0) { throw 'ESLint zakonczyl sie bledem.' }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Build Vite zakonczyl sie bledem.' }
    pnpm test:unit
    if ($LASTEXITCODE -ne 0) { throw 'Testy jednostkowe zakonczyly sie bledem.' }

    $pythonFiles = Get-ChildItem -Path $projectRoot -Recurse -File -Filter '*.py' |
        Where-Object { $_.FullName -notmatch '\\(node_modules|target|dist|desktop-dist|\.venv)\\' }
    if ($pythonFiles.Count -gt 0) {
        python -m ruff check $projectRoot
        if ($LASTEXITCODE -ne 0) { throw 'Ruff zakonczyl sie bledem.' }
        python -m mypy $projectRoot
        if ($LASTEXITCODE -ne 0) { throw 'mypy zakonczyl sie bledem.' }
    } else {
        Write-Host 'Ruff/mypy: pominieto - projekt nie zawiera plikow Python.' -ForegroundColor DarkGray
    }

    if (-not $SkipRust) {
        cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
        if ($LASTEXITCODE -ne 0) { throw 'cargo fmt zakonczyl sie bledem.' }
        cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
        if ($LASTEXITCODE -ne 0) { throw 'cargo clippy zakonczyl sie bledem.' }
    }

    Write-Host 'Wszystkie kontrole jakosci zakonczone powodzeniem.' -ForegroundColor Green
}
finally {
    Pop-Location
}
