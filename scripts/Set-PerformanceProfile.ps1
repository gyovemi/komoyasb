<#
.SYNOPSIS
    Applies or updates the active performance profile for komoyasb.
.DESCRIPTION
    Switches between validated performance profiles (ultra-low, balanced, visual-rich, gaming).
    Updates active_profile in performance.json and records state in themes/.current_perf.
    Invokes scripts/sync-theme.ps1 to re-render configurations and triggers service reloads.
    Supports -DryRun / -WhatIf and records actions in DryRunContext ledger.
.PARAMETER Profile
    Name of the performance profile to activate: 'ultra-low', 'balanced', 'visual-rich', or 'gaming'.
.PARAMETER DryRun
    Simulates performance profile switch without modifying files or processes.
.OUTPUTS
    None. Outputs operation status logs to console.
.EXAMPLE
    .\Set-PerformanceProfile.ps1 -Profile gaming
.EXAMPLE
    .\Set-PerformanceProfile.ps1 -Profile ultra-low -DryRun
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("ultra-low", "balanced", "visual-rich", "gaming", "custom")]
    [string]$Profile,

    [Parameter(Mandatory = $false)]
    [string]$SandboxRoot = "",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSCmdlet.ShouldProcess($Profile, "Set Performance Profile")) {
    # If -WhatIf is passed to ShouldProcess, it returns false automatically!
}

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun -or $SandboxRoot) {
    $DryRun = $true
}

$coreHelpersDir = Join-Path $PSScriptRoot "lib"
Import-Module (Join-Path $coreHelpersDir "Environment.psm1") -Force
Import-Module (Join-Path $coreHelpersDir "DryRunContext.psm1") -Force

if ($DryRun) {
    $existingContext = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    if (-not $existingContext -or -not $existingContext.Value -or -not $existingContext.Value.Active -or $SandboxRoot) {
        if ($SandboxRoot) {
            Initialize-ShadowContext -ShadowRoot $SandboxRoot | Out-Null
        } else {
            Initialize-ShadowContext | Out-Null
        }
    }
}

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

$workspaceRoot = Get-WorkspaceRoot
Write-Host "================================================================"
Write-Host "  komoyasb Performance Profile Switcher: $Profile"
Write-Host "================================================================"
Write-Host "Workspace Root : $workspaceRoot"
Write-Host "DryRun Mode    : $DryRun"

# 1. Validate Profile existence in performance.json
$perfFile = Join-Path $workspaceRoot "performance.json"
$effectivePerfFile = if ($isDry) {
    Resolve-TargetPath -Path $perfFile -Mode "Read"
} else {
    $perfFile
}

if (-not (Test-Path -LiteralPath $effectivePerfFile)) {
    throw "performance.json not found at $effectivePerfFile"
}

$perfContentRaw = [System.IO.File]::ReadAllText($effectivePerfFile, [System.Text.Encoding]::UTF8)
$perfConfigObject = $perfContentRaw | ConvertFrom-Json

if (-not $perfConfigObject.profiles.PSObject.Properties[$Profile]) {
    throw "Profile '$Profile' is not defined in $effectivePerfFile"
}

# 2. Update active_profile in performance.json
$perfConfigObject.active_profile = $Profile
$updatedPerfJson = ConvertTo-Json -InputObject $perfConfigObject -Depth 10

if ($isDry) {
    $effectivePerfWrite = Resolve-TargetPath -Path $perfFile -Mode "Write"
    $parentDir = Split-Path -Parent $effectivePerfWrite
    if ($parentDir -and -not (Test-Path -LiteralPath $parentDir)) {
        [System.IO.Directory]::CreateDirectory($parentDir) | Out-Null
    }
    [System.IO.File]::WriteAllText($effectivePerfWrite, $updatedPerfJson, [System.Text.UTF8Encoding]::new($false))
    Invoke-SystemAction -ActionType "FileWrite" -Target $perfFile -Metadata @{
        virtualPath = $effectivePerfWrite
        livePath = $perfFile
        profile = $Profile
    }
    Write-Host "[DRYRUN] Updated active_profile to '$Profile' in $effectivePerfWrite"
} else {
    [System.IO.File]::WriteAllText($perfFile, $updatedPerfJson, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Updated active_profile to '$Profile' in $perfFile"
}

# 3. Update themes/.current_perf
$perfStateFile = Join-Path (Join-Path $workspaceRoot "themes") ".current_perf"
if ($isDry) {
    $effectivePerfState = Resolve-TargetPath -Path $perfStateFile -Mode "Write"
    $perfStateDir = Split-Path -Parent $effectivePerfState
    if ($perfStateDir -and -not (Test-Path -LiteralPath $perfStateDir)) {
        [System.IO.Directory]::CreateDirectory($perfStateDir) | Out-Null
    }
    [System.IO.File]::WriteAllText($effectivePerfState, $Profile, [System.Text.UTF8Encoding]::new($false))
    Invoke-SystemAction -ActionType "FileWrite" -Target $perfStateFile -Metadata @{
        virtualPath = $effectivePerfState
        livePath = $perfStateFile
        profile = $Profile
    }
    Write-Host "[DRYRUN] Updated profile state marker in $effectivePerfState"
} else {
    [System.IO.File]::WriteAllText($perfStateFile, $Profile, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Updated profile state marker in $perfStateFile"
}

# 4. Determine current theme and run sync-theme.ps1
$currentThemeName = "dark"
$themeStateFile = Join-Path (Join-Path $workspaceRoot "themes") ".current_theme"
$effectiveThemeState = if ($isDry) {
    Resolve-TargetPath -Path $themeStateFile -Mode "Read"
} else {
    $themeStateFile
}

if (Test-Path -LiteralPath $effectiveThemeState) {
    $themeContent = (Get-Content -LiteralPath $effectiveThemeState -Raw).Trim()
    if (-not [string]::IsNullOrWhiteSpace($themeContent)) {
        $currentThemeName = $themeContent
    }
}

Write-Host "Invoking sync-theme.ps1 with Theme='$currentThemeName' and PerformanceProfile='$Profile'..."
$syncThemeScript = Join-Path $workspaceRoot "scripts/sync-theme.ps1"
& $syncThemeScript -Theme $currentThemeName -PerformanceProfile $Profile -DryRun:$DryRun -SandboxRoot $SandboxRoot

# 5. Reload running desktop environment services (komorebi, yasb)
Write-Host "Reloading runtime services for performance profile '$Profile'..."
if ($isDry) {
    Invoke-SystemAction -ActionType "ProcessControl" -Target "komorebi" -Metadata @{
        Action = "ReloadConfiguration"
        Profile = $Profile
    }
    Invoke-SystemAction -ActionType "ProcessControl" -Target "yasb" -Metadata @{
        Action = "Restart"
        Profile = $Profile
    }
    Write-Host "[DRYRUN] Simulated configuration reload for komorebi and yasb"
} else {
    # Check if komorebic is available to reload configuration cleanly
    if (Get-Command "komorebic" -ErrorAction SilentlyContinue) {
        try {
            komorebic reload-configuration
            Write-Host "Reloaded komorebi configuration."
        } catch {
            Write-Warning "Failed to reload komorebi via CLI: $_"
        }
    }

    # Signal yasb to reload (or restart if running)
    $yasbProc = Get-Process -Name "yasb" -ErrorAction SilentlyContinue
    if ($yasbProc) {
        try {
            $watchdogScript = Join-Path $workspaceRoot "scripts/watchdog.ps1"
            if (Test-Path -LiteralPath $watchdogScript) {
                & $watchdogScript -Action Restart -Service yasb -DryRun:$false
            }
        } catch {
            Write-Warning "Could not restart yasb via watchdog: $_"
        }
    }
}

Write-Host "Performance profile successfully switched to: $Profile" -ForegroundColor Green
