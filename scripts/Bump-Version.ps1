<#
.SYNOPSIS
    Single-source version synchronization and release tagging utility for komoyasb.
.DESCRIPTION
    Atomically updates version strings across all project manifests:
    - ui/package.json ("version": "x.y.z")
    - ui/src-tauri/Cargo.toml (version = "x.y.z" under [package])
    - ui/src-tauri/tauri.conf.json ("version": "x.y.z")
    - CHANGELOG.md (transforms [Unreleased] header to [x.y.z] - YYYY-MM-DD if file exists)
    Optionally stages/commits modified manifests and creates an annotated Git release tag.
.PARAMETER Version
    Semantic version string (e.g. "1.0.0", "1.0.1-rc.1"). Must match regex ^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$.
.PARAMETER Commit
    Stages and commits modified manifests with commit message 'chore(release): v<Version>'.
.PARAMETER Tag
    Creates an annotated Git tag 'v<Version>'.
.PARAMETER DryRun
    Simulates modifications and Git operations without writing to disk.
.EXAMPLE
    .\scripts\Bump-Version.ps1 -Version 1.0.0 -DryRun
.EXAMPLE
    .\scripts\Bump-Version.ps1 -Version 1.0.0
.EXAMPLE
    .\scripts\Bump-Version.ps1 -Version 1.0.0 -Commit -Tag
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$')]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [switch]$Commit,

    [Parameter(Mandatory = $false)]
    [switch]$Tag,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Determine repository root
$scriptDir = $PSScriptRoot
if (Test-Path -LiteralPath (Join-Path $scriptDir "..\ui\package.json")) {
    $repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
} elseif (Test-Path -LiteralPath (Join-Path $scriptDir "ui\package.json")) {
    $repoRoot = (Resolve-Path $scriptDir).Path
} else {
    $repoRoot = (Get-Location).Path
}

$pkgJsonPath   = Join-Path $repoRoot "ui\package.json"
$cargoTomlPath = Join-Path $repoRoot "ui\src-tauri\Cargo.toml"
$tauriConfPath = Join-Path $repoRoot "ui\src-tauri\tauri.conf.json"
$changelogPath = Join-Path $repoRoot "CHANGELOG.md"

if (-not (Test-Path -LiteralPath $pkgJsonPath)) {
    throw "Manifest not found: $pkgJsonPath"
}
if (-not (Test-Path -LiteralPath $cargoTomlPath)) {
    throw "Manifest not found: $cargoTomlPath"
}
if (-not (Test-Path -LiteralPath $tauriConfPath)) {
    throw "Manifest not found: $tauriConfPath"
}

# 1. Update ui/package.json
$pkgJsonRaw = [System.IO.File]::ReadAllText($pkgJsonPath, [System.Text.Encoding]::UTF8)
$currentPkgVersion = "unknown"
if ($pkgJsonRaw -match '(?m)^\s*"version"\s*:\s*"([^"]+)"') {
    $currentPkgVersion = $Matches[1]
}
$newPkgJsonRaw = $pkgJsonRaw -replace '(?m)^(\s*"version"\s*:\s*)"[^"]+"', "`$1`"$Version`""

# 2. Update ui/src-tauri/Cargo.toml (only under [package])
$cargoRaw = [System.IO.File]::ReadAllText($cargoTomlPath, [System.Text.Encoding]::UTF8)
$lines = $cargoRaw -split "\r?\n"
$inPackage = $false
$replacedCargo = $false
$currentCargoVersion = "unknown"
$newCargoLines = @()
foreach ($line in $lines) {
    if ($line -match '^\s*\[package\]\s*$') {
        $inPackage = $true
        $newCargoLines += $line
        continue
    }
    if ($inPackage -and $line -match '^\s*\[.*\]\s*$') {
        $inPackage = $false
    }
    if ($inPackage -and (-not $replacedCargo) -and $line -match '^\s*version\s*=\s*"([^"]+)"') {
        $currentCargoVersion = $Matches[1]
        $newCargoLines += ($line -replace 'version\s*=\s*"[^"]+"', "version = `"$Version`"")
        $replacedCargo = $true
        continue
    }
    $newCargoLines += $line
}
if (-not $replacedCargo) {
    throw "Failed to locate 'version = ...' under [package] in $cargoTomlPath"
}
$newCargoRaw = $newCargoLines -join [System.Environment]::NewLine

# 3. Update ui/src-tauri/tauri.conf.json
$tauriRaw = [System.IO.File]::ReadAllText($tauriConfPath, [System.Text.Encoding]::UTF8)
$currentTauriVersion = "unknown"
if ($tauriRaw -match '(?m)^\s*"version"\s*:\s*"([^"]+)"') {
    $currentTauriVersion = $Matches[1]
}
$newTauriRaw = $tauriRaw -replace '(?m)^(\s*"version"\s*:\s*)"[^"]+"', "`$1`"$Version`""

# 4. Update CHANGELOG.md (if present)
$changelogUpdated = $false
$newChangelogRaw = $null
$hasChangelog = Test-Path -LiteralPath $changelogPath
if ($hasChangelog) {
    $changelogRaw = [System.IO.File]::ReadAllText($changelogPath, [System.Text.Encoding]::UTF8)
    $today = (Get-Date).ToString("yyyy-MM-dd")
    if ($changelogRaw -match "\[$([regex]::Escape($Version))\]") {
        $newChangelogRaw = $changelogRaw
    } elseif ($changelogRaw -match '(?m)^##\s+\[Unreleased\]') {
        $newChangelogRaw = $changelogRaw -replace '(?m)^##\s+\[Unreleased\]', "## [Unreleased]`r`n`r`n## [$Version] - $today"
        $changelogUpdated = $true
    } else {
        $newChangelogRaw = $changelogRaw + "`r`n`r`n## [$Version] - $today`r`n"
        $changelogUpdated = $true
    }
}

# Display planned / applied updates
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Komoyasb Version Synchronization Engine                      " -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Target Version : $Version" -ForegroundColor Green
Write-Host "DryRun Mode    : $DryRun" -ForegroundColor Yellow
Write-Host "----------------------------------------------------------------"
Write-Host "  ui/package.json           : $currentPkgVersion -> $Version" -ForegroundColor $(if ($currentPkgVersion -eq $Version) { "DarkGray" } else { "Yellow" })
Write-Host "  ui/src-tauri/Cargo.toml   : $currentCargoVersion -> $Version" -ForegroundColor $(if ($currentCargoVersion -eq $Version) { "DarkGray" } else { "Yellow" })
Write-Host "  ui/src-tauri/tauri.conf   : $currentTauriVersion -> $Version" -ForegroundColor $(if ($currentTauriVersion -eq $Version) { "DarkGray" } else { "Yellow" })
if ($hasChangelog) {
    $clMsg = if ($changelogUpdated) { "Updated header for [$Version]" } else { "Already contains entry for [$Version]" }
    Write-Host "  CHANGELOG.md              : $clMsg" -ForegroundColor $(if ($changelogUpdated) { "Yellow" } else { "DarkGray" })
} else {
    Write-Host "  CHANGELOG.md              : (File not found, skipping)" -ForegroundColor DarkGray
}

if ($DryRun) {
    Write-Host "`n[DRY-RUN] Zero files modified on disk." -ForegroundColor Green
    if ($Commit) {
        Write-Host "[DRY-RUN] Would execute: git add ui/package.json ui/src-tauri/Cargo.toml ui/src-tauri/tauri.conf.json" -ForegroundColor DarkCyan
        if ($hasChangelog) {
            Write-Host "[DRY-RUN] Would execute: git add CHANGELOG.md" -ForegroundColor DarkCyan
        }
        Write-Host "[DRY-RUN] Would execute: git commit -m `"chore(release): v$Version`"" -ForegroundColor DarkCyan
    }
    if ($Tag) {
        Write-Host "[DRY-RUN] Would execute: git tag -a `"v$Version`" -m `"Release v$Version`"" -ForegroundColor DarkCyan
    }
} else {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($pkgJsonPath, $newPkgJsonRaw, $utf8NoBom)
    [System.IO.File]::WriteAllText($cargoTomlPath, $newCargoRaw, $utf8NoBom)
    [System.IO.File]::WriteAllText($tauriConfPath, $newTauriRaw, $utf8NoBom)
    if ($changelogUpdated -and ($null -ne $newChangelogRaw)) {
        [System.IO.File]::WriteAllText($changelogPath, $newChangelogRaw, $utf8NoBom)
    }
    Write-Host "`n[SUCCESS] Manifest files synchronized to $Version." -ForegroundColor Green

    $hasGit = Test-Path -LiteralPath (Join-Path $repoRoot ".git")
    if ($Commit) {
        if ($hasGit) {
            Push-Location $repoRoot
            try {
                & git add ui/package.json ui/src-tauri/Cargo.toml ui/src-tauri/tauri.conf.json
                if ($LASTEXITCODE -ne 0) {
                    throw "git add failed with exit code $LASTEXITCODE"
                }
                if ($hasChangelog) {
                    & git add CHANGELOG.md
                    if ($LASTEXITCODE -ne 0) {
                        throw "git add CHANGELOG.md failed with exit code $LASTEXITCODE"
                    }
                }
                & git commit -m "chore(release): v$Version"
                if ($LASTEXITCODE -ne 0) {
                    throw "git commit failed with exit code $LASTEXITCODE"
                }
                Write-Host "  [+] Committed version bump v$Version" -ForegroundColor Green
            } finally {
                Pop-Location
            }
        } else {
            Write-Warning "Cannot commit: Git repository (.git) not initialized."
        }
    }

    if ($Tag) {
        if ($hasGit) {
            Push-Location $repoRoot
            try {
                & git tag -a "v$Version" -m "Release v$Version"
                if ($LASTEXITCODE -ne 0) {
                    throw "git tag failed with exit code $LASTEXITCODE"
                }
                Write-Host "  [+] Created git tag v$Version" -ForegroundColor Green
            } finally {
                Pop-Location
            }
        } else {
            Write-Warning "Cannot tag: Git repository (.git) not initialized."
        }
    }
}
