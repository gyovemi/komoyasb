<#
.SYNOPSIS
    Automated GitHub repository provisioning and origin synchronization for komoyasb.
.DESCRIPTION
    Provisions and configures the remote GitHub repository using GitHub CLI (gh.exe):
    1. Resolves and validates GitHub CLI (gh.exe) installation and authentication.
    2. Initializes local Git repository on 'main' branch if not already initialized.
    3. Verifies and configures local git user.name and user.email if missing.
    4. Creates the remote GitHub repository and links the 'origin' remote.
    5. Configures repository topics on GitHub.
    6. If -Push is specified, stages files, commits initial release, pushes 'main', creates annotated tag 'v1.0.0', and pushes tag.
    7. Supports -DryRun mode to simulate all operations with zero mutations.
.PARAMETER RepoName
    Name of the GitHub repository. Defaults to 'komoyasb'.
.PARAMETER Visibility
    Visibility of the repository ('public' or 'private'). Defaults to 'public'.
.PARAMETER Description
    Repository description on GitHub.
.PARAMETER Topics
    Array of topic tags to associate with the repository.
.PARAMETER Push
    Stages changes, commits initial release, pushes main branch, and pushes annotated tag v1.0.0.
.PARAMETER DryRun
    Simulates all provisioning, configuration, and git operations without making any changes.
.EXAMPLE
    .\scripts\Publish-GitHubRepo.ps1 -DryRun
.EXAMPLE
    .\scripts\Publish-GitHubRepo.ps1 -Push
.EXAMPLE
    .\scripts\Publish-GitHubRepo.ps1 -Visibility private -DryRun
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false)]
    [string]$RepoName = "komoyasb",

    [Parameter(Mandatory = $false)]
    [ValidateSet("public", "private")]
    [string]$Visibility = "public",

    [Parameter(Mandatory = $false)]
    [string]$Description = "Production-grade, modular, dynamic Windows 11 desktop environment built to outperform Seelen UI",

    [Parameter(Mandatory = $false)]
    [string[]]$Topics = @("windows11", "desktop-environment", "komorebi", "yasb", "tauri", "rust", "react", "tiling-window-manager"),

    [Parameter(Mandatory = $false)]
    [switch]$Push,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Determine repository root
$scriptDir = $PSScriptRoot
if (Test-Path -LiteralPath (Join-Path $scriptDir "..\bootstrap.ps1")) {
    $repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
} elseif (Test-Path -LiteralPath (Join-Path $scriptDir "bootstrap.ps1")) {
    $repoRoot = (Resolve-Path $scriptDir).Path
} else {
    $repoRoot = (Get-Location).Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  komoyasb GitHub Repository Provisioning Engine               " -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Target Repository  : $RepoName" -ForegroundColor White
Write-Host "Target Visibility  : $Visibility" -ForegroundColor White
Write-Host "DryRun Mode        : $DryRun" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Green" })
Write-Host "Push Enabled       : $Push" -ForegroundColor $(if ($Push) { "Yellow" } else { "DarkGray" })
Write-Host "Repository Root    : $repoRoot" -ForegroundColor DarkGray
Write-Host "----------------------------------------------------------------"

# Step 1: Resolve GitHub CLI (gh.exe)
Write-Host "`n[1/5] Resolving GitHub CLI (gh.exe)..." -ForegroundColor Yellow
$ghPath = $null
$ghCmd = Get-Command "gh" -ErrorAction SilentlyContinue
if ($null -ne $ghCmd) {
    $ghPath = $ghCmd.Source
} else {
    $candidatePaths = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
    )
    foreach ($cand in $candidatePaths) {
        if (Test-Path -LiteralPath $cand) {
            $ghPath = $cand
            break
        }
    }
}

if (-not $ghPath) {
    if ($DryRun) {
        Write-Warning "GitHub CLI (gh.exe) not detected in environment PATH or standard locations."
        Write-Host "  [DRY-RUN] Simulating GitHub CLI binary as 'gh'." -ForegroundColor Cyan
        $ghPath = "gh"
    } else {
        throw "GitHub CLI (gh.exe) is required but was not found. Please install it via 'winget install GitHub.cli' or from https://cli.github.com"
    }
} else {
    Write-Host "  [+] GitHub CLI located: $ghPath" -ForegroundColor Green
}

# Step 2: Validate Authentication and Resolve User
Write-Host "`n[2/5] Validating GitHub Authentication..." -ForegroundColor Yellow
$resolvedUser = $null
try {
    $authOutput = & $ghPath auth status 2>&1 | Out-String
    if ($authOutput -match 'account\s+([a-zA-Z0-9_\-]+)') {
        $resolvedUser = $Matches[1]
    } elseif ($authOutput -match 'as\s+([a-zA-Z0-9_\-]+)') {
        $resolvedUser = $Matches[1]
    } elseif ($authOutput -match 'user\s+([a-zA-Z0-9_\-]+)') {
        $resolvedUser = $Matches[1]
    }
} catch {
    # Handled below
}

if (-not $resolvedUser) {
    if ($DryRun) {
        Write-Warning "Unable to query 'gh auth status' directly (sandbox or unauthenticated)."
        Write-Host "  [DRY-RUN] Resolving default authenticated user: 'gyovemi'" -ForegroundColor Cyan
        $resolvedUser = "gyovemi"
    } else {
        throw "GitHub CLI is not authenticated. Please run 'gh auth login -w -p ssh' before proceeding."
    }
} else {
    Write-Host "  [+] Authenticated user resolved: $resolvedUser" -ForegroundColor Green
}

$canonicalRepo = "$resolvedUser/$RepoName"
Write-Host "  [+] Canonical Repository ID : $canonicalRepo" -ForegroundColor Green

# Step 3: Local Git Repository Initialization & Configuration Check
Write-Host "`n[3/5] Inspecting Local Git Repository..." -ForegroundColor Yellow
$gitDir = Join-Path $repoRoot ".git"
$gitInitialized = Test-Path -LiteralPath $gitDir

if (-not $gitInitialized) {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would execute: git init -b main (in $repoRoot)" -ForegroundColor Cyan
    } else {
        git -C $repoRoot init -b main
        if ($LASTEXITCODE -ne 0) {
            throw "git init failed with exit code $LASTEXITCODE"
        }
        Write-Host "  [+] Initialized Git repository on 'main' branch." -ForegroundColor Green
    }
} else {
    Write-Host "  [+] Git repository (.git) already exists." -ForegroundColor Green
}

# Verify user.name and user.email
$currentGitUser = ""
$currentGitEmail = ""
if ($gitInitialized) {
    try {
        $userOut = & git -C $repoRoot config --get user.name
        if ($LASTEXITCODE -eq 0 -and $userOut) { $currentGitUser = ("$userOut").Trim() }
    } catch {}
    try {
        $emailOut = & git -C $repoRoot config --get user.email
        if ($LASTEXITCODE -eq 0 -and $emailOut) { $currentGitEmail = ("$emailOut").Trim() }
    } catch {}
}

if ([string]::IsNullOrWhiteSpace($currentGitUser)) {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would set git config user.name `"$resolvedUser`"" -ForegroundColor Cyan
    } else {
        git -C $repoRoot config user.name "$resolvedUser"
        Write-Host "  [+] Configured git user.name: $resolvedUser" -ForegroundColor Green
    }
} else {
    Write-Host "  [+] git user.name: $currentGitUser" -ForegroundColor DarkGray
}

if ([string]::IsNullOrWhiteSpace($currentGitEmail)) {
    $fallbackEmail = "$resolvedUser@users.noreply.github.com"
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would set git config user.email `"$fallbackEmail`"" -ForegroundColor Cyan
    } else {
        git -C $repoRoot config user.email "$fallbackEmail"
        Write-Host "  [+] Configured git user.email: $fallbackEmail" -ForegroundColor Green
    }
} else {
    Write-Host "  [+] git user.email: $currentGitEmail" -ForegroundColor DarkGray
}

# Step 4: Remote GitHub Repository Creation
Write-Host "`n[4/5] Checking Remote Origin & GitHub Repository..." -ForegroundColor Yellow
$originUrl = ""
$hasOrigin = $false
if ($gitInitialized) {
    try {
        $remotes = & git -C $repoRoot remote
        if ($LASTEXITCODE -eq 0 -and ($remotes -contains "origin")) {
            $originUrl = (& git -C $repoRoot remote get-url origin).Trim()
            $hasOrigin = $true
        }
    } catch {}
}

if (-not $hasOrigin) {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would execute: & `"$ghPath`" repo create $RepoName --$Visibility --description `"$Description`" --source=. --remote=origin" -ForegroundColor Cyan
    } else {
        Push-Location $repoRoot
        try {
            & $ghPath repo create $RepoName "--$Visibility" --description $Description --source=. --remote=origin
            if ($LASTEXITCODE -ne 0) {
                throw "gh repo create failed with exit code $LASTEXITCODE"
            }
            Write-Host "  [+] Created GitHub repository '$canonicalRepo' and added remote 'origin'." -ForegroundColor Green
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Host "  [+] Remote 'origin' already configured: $originUrl" -ForegroundColor Green
}

# Edit repository topics
$topicString = $Topics -join ","
if ($DryRun) {
    Write-Host "  [DRY-RUN] Would execute: & `"$ghPath`" repo edit `"$canonicalRepo`" --add-topic `"$topicString`"" -ForegroundColor Cyan
} else {
    & $ghPath repo edit "$canonicalRepo" --add-topic $topicString
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [+] Associated topics ($topicString) with $canonicalRepo." -ForegroundColor Green
    } else {
        Write-Warning "Failed to set topics on $canonicalRepo (exit code $LASTEXITCODE)."
    }
}

# Step 5: Git Staging, Commit & Push Workflow
Write-Host "`n[5/5] Git Release Packaging & Push Operations..." -ForegroundColor Yellow
if ($DryRun) {
    if ($Push) {
        Write-Host "  [DRY-RUN] Active -Push mode simulation:" -ForegroundColor Yellow
    } else {
        Write-Host "  [DRY-RUN] (Simulation preview of what -Push would execute):" -ForegroundColor DarkGray
    }
    Write-Host "  [DRY-RUN] Would execute: git -C `"$repoRoot`" add ." -ForegroundColor Cyan
    Write-Host "  [DRY-RUN] Would execute: git -C `"$repoRoot`" commit -m `"feat: initial open-source release v1.0.0`"" -ForegroundColor Cyan
    Write-Host "  [DRY-RUN] Would execute: git -C `"$repoRoot`" push -u origin main" -ForegroundColor Cyan
    Write-Host "  [DRY-RUN] Would execute: git -C `"$repoRoot`" tag -a `"v1.0.0`" -m `"Release v1.0.0`"" -ForegroundColor Cyan
    Write-Host "  [DRY-RUN] Would execute: git -C `"$repoRoot`" push origin `"v1.0.0`"" -ForegroundColor Cyan
    Write-Host "`n[DRY-RUN COMPLETED] All planned operations verified cleanly with zero mutations." -ForegroundColor Green
} else {
    if ($Push) {
        Push-Location $repoRoot
        try {
            Write-Host "  [+] Staging repository files..." -ForegroundColor Green
            & git add .

            $statusPorcelain = (& git status --porcelain 2>&1 | Out-String).Trim()
            if (-not [string]::IsNullOrWhiteSpace($statusPorcelain)) {
                Write-Host "  [+] Creating initial release commit..." -ForegroundColor Green
                & git commit -m "feat: initial open-source release v1.0.0"
                if ($LASTEXITCODE -ne 0) {
                    throw "git commit failed with exit code $LASTEXITCODE"
                }
            } else {
                Write-Host "  [*] Working tree clean; no uncommitted changes." -ForegroundColor DarkGray
            }

            Write-Host "  [+] Pushing 'main' branch to remote origin..." -ForegroundColor Green
            & git push -u origin main
            if ($LASTEXITCODE -ne 0) {
                throw "git push origin main failed with exit code $LASTEXITCODE"
            }

            $existingTag = (& git tag -l "v1.0.0" 2>&1 | Out-String).Trim()
            if (-not ($existingTag -eq "v1.0.0")) {
                Write-Host "  [+] Creating annotated tag v1.0.0..." -ForegroundColor Green
                & git tag -a "v1.0.0" -m "Release v1.0.0"
            } else {
                Write-Host "  [*] Tag v1.0.0 already exists locally." -ForegroundColor DarkGray
            }

            Write-Host "  [+] Pushing tag v1.0.0 to remote origin..." -ForegroundColor Green
            & git push origin "v1.0.0"
            if ($LASTEXITCODE -ne 0) {
                throw "git push origin v1.0.0 failed with exit code $LASTEXITCODE"
            }

            Write-Host "`n[SUCCESS] Repository published and tagged successfully at https://github.com/$canonicalRepo" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  [*] Omitted -Push. Repository local configurations prepared without pushing." -ForegroundColor Yellow
        Write-Host "      To push and tag v1.0.0, rerun with: .\scripts\Publish-GitHubRepo.ps1 -Push" -ForegroundColor DarkGray
    }
}

Write-Host "================================================================" -ForegroundColor Cyan
