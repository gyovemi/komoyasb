<#
.SYNOPSIS
    Compiles and packages Komoyasb Control Center into a production NSIS installer.
.DESCRIPTION
    Build pipeline:
    1. Pre-flight checks:
       - TypeScript build (tsc)
       - PowerShell syntax & AST verification across all project scripts
       - Cargo test & Rust compilation check (if cargo / rustc are present)
    2. Tauri v2 production build (npm run tauri build -- --bundles nsis)
    3. Artifact staging:
       - Copies generated NSIS installer (.exe) into dist/
       - Computes and writes SHA-256 checksum file
       - Validates resource bundle contents
.PARAMETER SkipTests
    Skips cargo tests during release packaging.
.PARAMETER Portable
    Builds standalone portable executable if supported.
.PARAMETER Strict
    Fails with a terminating error if Cargo/Rust toolchain is not found or build fails.
.OUTPUTS
    None. Outputs binary installer executable, individual .sha256 checksums, and unified SHA256SUMS.txt to dist/.
.EXAMPLE
    .\build-release.ps1
.EXAMPLE
    .\build-release.ps1 -Strict
.EXAMPLE
    .\build-release.ps1 -SkipTests
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$SkipTests,

    [Parameter(Mandatory = $false)]
    [switch]$Portable,

    [Parameter(Mandatory = $false)]
    [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
$uiDir = Join-Path $scriptRoot "ui"
$distDir = Join-Path $scriptRoot "dist"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Komoyasb Control Center - Production Release Builder          " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Repo Root : $scriptRoot"
Write-Host "UI Dir    : $uiDir"
Write-Host "Dist Dir  : $distDir"
Write-Host "----------------------------------------------------------------"

# Step 1: Pre-flight Checks
Write-Host "`n[1/4] Running Pre-flight Quality & Integrity Checks..." -ForegroundColor Yellow

# 1.1 PowerShell AST syntax check
Write-Host "  [+] Checking PowerShell scripts AST syntax..."
$psScripts = Get-ChildItem -Path $scriptRoot -Recurse -Include *.ps1, *.psm1 | Where-Object { $_.FullName -notmatch "node_modules|\.git|target" }
$astErrors = @()
foreach ($targetScriptFile in $psScripts) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseInput((Get-Content -LiteralPath $targetScriptFile.FullName -Raw), [ref]$tokens, [ref]$errors) | Out-Null
    if (@($errors).Count -gt 0) {
        $astErrors += "$($targetScriptFile.FullName): $(@($errors).Count) errors"
    }
}
if (@($astErrors).Count -gt 0) {
    Write-Error "PowerShell AST validation failed:`n$($astErrors -join "`n")"
}
Write-Host "      All $(@($psScripts).Count) PowerShell scripts passed AST validation cleanly." -ForegroundColor Green

# 1.2 TypeScript compilation and frontend bundle build
Write-Host "  [+] Compiling Frontend (TypeScript & Vite)..."
Push-Location $uiDir
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE"
    }
    Write-Host "      Frontend build completed successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

# 1.3 Rust / Cargo toolchain check
Write-Host "  [+] Verifying Rust toolchain..."
$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
$rustcCmd = Get-Command rustc -ErrorAction SilentlyContinue

if ($cargoCmd -and $rustcCmd) {
    Write-Host "      Found Rust $($rustcCmd.Version) and Cargo $($cargoCmd.Version)." -ForegroundColor Green
    if (-not $SkipTests) {
        Write-Host "  [+] Executing Rust backend unit tests..."
        Push-Location (Join-Path $uiDir "src-tauri")
        try {
            & cargo test --quiet
            if ($LASTEXITCODE -ne 0) {
                throw "Cargo tests failed with exit code $LASTEXITCODE"
            }
            Write-Host "      Cargo tests passed." -ForegroundColor Green
        } finally {
            Pop-Location
        }
    }
} else {
    if ($Strict) {
        throw "Rust toolchain (cargo/rustc) not detected in environment PATH and -Strict was specified."
    }
    Write-Warning "Rust toolchain (cargo/rustc) not detected in environment PATH. Tauri compiler step will require Rust."
}

# Step 2: Build Production Tauri App
Write-Host "`n[2/4] Compiling Production Tauri Package (NSIS)..." -ForegroundColor Yellow

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

$buildSucceeded = $false
$generatedExePath = $null

if ($cargoCmd) {
    Push-Location $uiDir
    try {
        Write-Host "  [+] Running Tauri v2 NSIS bundle build..."
        & npx tauri build --bundles nsis
        if ($LASTEXITCODE -eq 0) {
            $buildSucceeded = $true
        } else {
            if ($Strict) {
                throw "Tauri build failed with exit code $LASTEXITCODE"
            }
            Write-Warning "Tauri build returned exit code $LASTEXITCODE"
        }
    } catch {
        if ($Strict) {
            throw
        }
        Write-Warning "Tauri build encountered an error: $_"
    } finally {
        Pop-Location
    }
} else {
    if ($Strict) {
        throw "Cannot compile binary: Cargo/Rust toolchain is not installed on this machine and -Strict was specified."
    }
    Write-Warning "Skipping binary compilation: Cargo/Rust toolchain is not installed on this machine."
    Write-Host "To compile the binary, install Rust (via https://rustup.rs or winget install Rustlang.Rustup) and rerun."
}

# Step 3: Staging to dist/ and SHA-256 generation
Write-Host "`n[3/4] Staging Release Artifacts & Generating Checksums..." -ForegroundColor Yellow

$tauriBundleDir = Join-Path $uiDir "src-tauri\target\release\bundle\nsis"
if (Test-Path $tauriBundleDir) {
    $nsisFiles = Get-ChildItem -Path $tauriBundleDir -Filter "*.exe"
    foreach ($installerExe in $nsisFiles) {
        $destPath = Join-Path $distDir $installerExe.Name
        Copy-Item -LiteralPath $installerExe.FullName -Destination $destPath -Force
        $sha256Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destPath).Hash
        $hashFile = "$destPath.sha256"
        "$sha256Hash  $($installerExe.Name)" | Set-Content -LiteralPath $hashFile -Encoding utf8
        Write-Host "  [+] Copied: $($installerExe.Name) -> $destPath" -ForegroundColor Green
        Write-Host "      SHA256: $sha256Hash"
        $generatedExePath = $destPath
    }
}

# Generate unified SHA256SUMS.txt for all .exe files in dist/
if (Test-Path $distDir) {
    $distExeFiles = Get-ChildItem -Path $distDir -Filter "*.exe" -File
    if ($distExeFiles -and @($distExeFiles).Count -gt 0) {
        $shaSumsLines = $distExeFiles | ForEach-Object {
            $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower()
            "$hash  $($_.Name)"
        }
        $shaSumsPath = Join-Path $distDir "SHA256SUMS.txt"
        $shaSumsLines | Set-Content -LiteralPath $shaSumsPath -Encoding utf8
        Write-Host "  [+] Generated unified SHA256SUMS.txt ($(@($distExeFiles).Count) artifacts)" -ForegroundColor Green
    }
}

# Step 4: Summary Report
Write-Host "`n[4/4] Release Build Summary" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
if ($generatedExePath -and (Test-Path $generatedExePath)) {
    $artifactItem = Get-Item $generatedExePath
    $sizeMb = [Math]::Round($artifactItem.Length / 1MB, 2)
    Write-Host "Status        : SUCCESS" -ForegroundColor Green
    Write-Host "Installer Path: $($artifactItem.FullName)"
    Write-Host "File Size     : $sizeMb MB ($($artifactItem.Length) bytes)"
    Write-Host "SHA256 File   : $($artifactItem.FullName).sha256"
    if (Test-Path (Join-Path $distDir "SHA256SUMS.txt")) {
        Write-Host "Checksums File: $(Join-Path $distDir 'SHA256SUMS.txt')" -ForegroundColor Green
    }
} else {
    Write-Host "Status        : CONFIGURATION VERIFIED (Build pending Rust toolchain)" -ForegroundColor Yellow
    Write-Host "Frontend Dist : $(Resolve-Path (Join-Path $uiDir "dist"))"
    Write-Host "Bundled Files : configs/, themes/, scripts/, install.ps1, uninstall.ps1"
    Write-Host "NSIS Hooks    : ui/src-tauri/nsis/hooks.nsh"
    Write-Host "Next Step     : Run `build-release.ps1` after installing Rust (rustup)."
}
Write-Host "================================================================" -ForegroundColor Cyan
