<#
.SYNOPSIS
    Provisions, configures, and links all components of the komoyasb desktop environment.
.DESCRIPTION
    Unified installer and winget orchestrator:
    - Pre-flight checks on OS and privileges.
    - Non-destructive, detect-first package provisioning via winget.
    - Timestamped transactional backups of existing user configurations.
    - Symlinks / copies workspace configurations to target runtime directories.
    - Compiles active theme into runtime files via sync-theme.ps1.
    - Optionally invokes Windhawk mod deployment.
    - Supports full -DryRun and -WhatIf modes.
.PARAMETER SkipPackages
    Skips winget package verification and installation.
.PARAMETER Theme
    Initial theme to compile and activate ("dark" or "light"). Defaults to "dark".
.PARAMETER ApplyWindhawk
    Enables automatic injection of Windhawk mods if Windhawk is present.
.PARAMETER NoAdmin
    Forces rootless execution mode without administrative rights.
    Auto-enabled when running as a standard non-elevated user.
.PARAMETER DryRun
    Simulates entire installation pipeline without altering disk, packages, or services.
.PARAMETER SandboxRoot
    Target root directory for shadow execution when in DryRun mode.
.PARAMETER KeepSandbox
    Retains shadow execution sandbox directory after completion.
.PARAMETER LedgerPath
    Path to export the structured JSON execution ledger.
.PARAMETER WhatIf
    Standard PowerShell WhatIf switch.
.OUTPUTS
    None. Outputs console progress and optional JSON execution ledger.
.EXAMPLE
    .\install.ps1 -Theme dark
.EXAMPLE
    .\install.ps1 -NoAdmin -DryRun
.EXAMPLE
    .\install.ps1 -DryRun -KeepSandbox
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true, PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $false)]
    [switch]$SkipPackages,

    [Parameter(Mandatory = $false)]
    [string]$Theme = "dark",

    [Parameter(Mandatory = $false)]
    [switch]$ApplyWindhawk,

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [string]$SandboxRoot = "",

    [Parameter(Mandatory = $false)]
    [switch]$KeepSandbox,

    [Parameter(Mandatory = $false)]
    [string]$LedgerPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun) {
    $DryRun = $true
}

# Per-phase performance telemetry tracking
$phaseTimings = [System.Collections.Specialized.OrderedDictionary]::new()
$totalStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Measure-InstallPhase {
    <#
    .SYNOPSIS
        Measures wall-clock execution time for a distinct installation phase.
    .PARAMETER PhaseName
        Descriptive label of the installation stage being profiled.
    .PARAMETER Block
        Scriptblock representing the unit of work to execute and measure.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$PhaseName,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Block
    )

    $phaseStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try { & $Block }
    finally {
        $phaseStopwatch.Stop()
        $phaseTimings[$PhaseName] = $phaseStopwatch.ElapsedMilliseconds
    }
}

$cmdPath = if ($MyInvocation -and $MyInvocation.MyCommand -and ($MyInvocation.MyCommand.PSObject.Properties['Path'])) { $MyInvocation.MyCommand.Path } else { $null }
$scriptDir = if ($PSScriptRoot) {
    $PSScriptRoot
} elseif ($cmdPath) {
    Split-Path -Parent $cmdPath
} elseif (Get-Command "Get-WorkspaceRoot" -ErrorAction SilentlyContinue) {
    Get-WorkspaceRoot
} else {
    $fallbackCandidates = @(
        (Join-Path $env:LOCALAPPDATA "komoyasb"),
        (Get-Location).Path
    )
    $resolvedDir = $null
    foreach ($cand in $fallbackCandidates) {
        try {
            if ($cand -and (Test-Path -LiteralPath (Join-Path $cand "scripts\lib\Environment.psm1") -ErrorAction SilentlyContinue)) {
                $resolvedDir = $cand
                break
            }
        } catch {}
    }
    if ($resolvedDir) { $resolvedDir } else { (Get-Location).Path }
}

$coreHelpersDir = Join-Path $scriptDir "scripts\lib"
Import-Module (Join-Path $coreHelpersDir "Environment.psm1") -Force

# Privilege resolution:
$isAdmin = Test-IsAdministrator
$rootlessMode = $NoAdmin -or (-not $isAdmin)

if ($rootlessMode) {
    Write-Host "[komoyasb] Operating in ROOTLESS MODE (Non-Admin / Zero-UAC)." -ForegroundColor Cyan
    Write-Host "[komoyasb] All packages will be scoped to current user; machine-only mods will gracefully degrade." -ForegroundColor DarkGray
} else {
    Write-Host "[komoyasb] Operating in ELEVATED MODE (Administrator)." -ForegroundColor Yellow
}

Measure-InstallPhase -PhaseName "Pre-flight" -Block {
    if ($DryRun) {
        $existingCtx = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
        if (-not $existingCtx -or -not $existingCtx.Value -or -not $existingCtx.Value.Active -or $SandboxRoot) {
            Initialize-ShadowContext -ShadowRoot $SandboxRoot -KeepSandbox:$KeepSandbox | Out-Null
        }
    }

    $global:workspaceRoot = Get-WorkspaceRoot
    Write-Host "================================================================"
    Write-Host "  komoyasb Desktop Environment Unified Provisioner & Installer "
    Write-Host "================================================================"
    Write-Host "Workspace Root : $global:workspaceRoot"
    Write-Host "Target Theme   : $Theme"
    Write-Host "DryRun Mode    : $DryRun"
    Write-Host "Privilege Mode : $(if ($rootlessMode) { 'ROOTLESS (Non-Admin / Zero-UAC)' } else { 'ELEVATED (Administrator)' })"
    Write-Host "----------------------------------------------------------------"
}

$workspaceRoot = $global:workspaceRoot
$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
$appData     = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }

# 1. Component Registry & Package Definitions (Data-driven table)
$packages = @(
    @{ Name = "Komorebi";       Command = "komorebi";      PackageId = "LGUG2Z.komorebi";             Source = "";        Required = $true  },
    @{ Name = "whkd";           Command = "whkd";          PackageId = "LGUG2Z.whkd";                 Source = "";        Required = $true  },
    @{ Name = "YASB Reborn";    Command = "yasb";          PackageId = "AmN.yasb";                    Source = "";        Required = $true  },
    @{ Name = "Flow Launcher";  Command = "Flow.Launcher"; PackageId = "Flow-Launcher.Flow-Launcher"; Source = "";        Required = $false },
    @{ Name = "Everything";     Command = "Everything";    PackageId = "voidtools.Everything";        Source = "";        Required = $false },
    @{ Name = "Windhawk";       Command = "windhawk-cli";  PackageId = "RamenSoftware.Windhawk";      Source = "";        Required = $false },
    @{ Name = "EarTrumpet";     Command = "EarTrumpet";    PackageId = "File-New-Project.EarTrumpet";  Source = "";        Required = $false },
    @{ Name = "FluentFlyout";   Command = "";              PackageId = "9N45NSM4TNBP";                 Source = "msstore"; Required = $false }
)

# 2. Package Provisioning (Detect-First)
Measure-InstallPhase -PhaseName "Winget Package Provisioning" -Block {
    if ($SkipPackages) {
        Write-Host "`n[1/5] Skipping package provisioning as requested."
        return
    }

    Write-Host "`n[1/5] Checking and Provisioning Subsystem Packages..."
    foreach ($pkg in $packages) {
        if ($rootlessMode -and $pkg.PackageId -eq "RamenSoftware.Windhawk") {
            Write-Host "  [SKIP] Skipping machine-scope package $($pkg.Name) in Rootless mode (native fallbacks active)." -ForegroundColor Yellow
            Install-WingetPackage -PackageId $pkg.PackageId -CustomSource $pkg.Source -NoAdmin:$rootlessMode -DryRun:$DryRun | Out-Null
            continue
        }

        $alreadyInstalled = ($pkg.Command -and (Test-CommandAvailable -CommandName $pkg.Command)) -or (Test-WingetPackageInstalled -PackageId $pkg.PackageId)
        if ($alreadyInstalled) {
            Write-Host "  [OK] $($pkg.Name) is already installed."
            continue
        }

        Write-Host "  [INSTALLING] $($pkg.Name) ($($pkg.PackageId))..."
        $installed = Install-WingetPackage -PackageId $pkg.PackageId -CustomSource $pkg.Source -NoAdmin:$rootlessMode -DryRun:$DryRun
        if (-not $installed -and $pkg.Required) {
            Write-Warning "Required package $($pkg.Name) failed to install via winget."
        }
    }
}

# 3. Create Backup Manifest & Backup Existing Target Configurations
Measure-InstallPhase -PhaseName "Config Backups" -Block {
    Write-Host "`n[2/5] Creating Timestamped Transactional Backups of Configs..."
    $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
    $backupBase = Join-Path (Join-Path $workspaceRoot "themes") ".backups"
    $backupDir = Join-Path $backupBase $timestamp

    $targetFiles = @(
        (Join-Path $userProfile ".config\komorebi\komorebi.json"),
        (Join-Path $userProfile ".config\komorebi\applications.yaml"),
        (Join-Path $userProfile ".config\whkdrc"),
        (Join-Path $userProfile ".config\yasb\config.yaml"),
        (Join-Path $userProfile ".config\yasb\styles.css"),
        (Join-Path $appData "FlowLauncher\Settings\Settings.json"),
        (Join-Path $appData "FlowLauncher\Themes\KomoyasbFluent.xaml")
    )

    $backupManifest = @{ Timestamp = $timestamp; Backups = @() }
    foreach ($targetFile in $targetFiles) {
        if (Test-Path -LiteralPath $targetFile -PathType Leaf -ErrorAction SilentlyContinue) {
            $backupResultPath = Backup-FileWithTimestamp -SourcePath $targetFile -BackupDir $backupDir -DryRun:$DryRun
            if ($backupResultPath) {
                $backupManifest.Backups += @{ Original = $targetFile; Backup = $backupResultPath }
            }
        }
    }

    if (@($backupManifest.Backups).Count -eq 0) {
        Write-Host "No existing target configuration files found to back up. Skipping snapshot creation."
        return
    }

    New-DirectorySafely -Path $backupDir -DryRun:$DryRun
    $manifestFile = Join-Path $backupDir "manifest.json"
    $latestBackupPtr = Join-Path (Join-Path $workspaceRoot "themes") ".latest_backup.txt"
    $manifestJson = ConvertTo-JsonSafe -InputObject $backupManifest -Depth 5

    if (Test-IsDryRun) {
        $effectiveManifest = Resolve-TargetPath -Path $manifestFile -Mode "Write"
        $manifestDir = Split-Path -Parent $effectiveManifest
        if ($manifestDir -and -not (Test-Path -LiteralPath $manifestDir)) {
            [System.IO.Directory]::CreateDirectory($manifestDir) | Out-Null
        }
        [System.IO.File]::WriteAllText($effectiveManifest, $manifestJson, [System.Text.UTF8Encoding]::new($false))
        Invoke-SystemAction -ActionType "FileWrite" -Target $manifestFile -Metadata @{ virtualPath = $effectiveManifest; livePath = $manifestFile }

        $effectivePtr = Resolve-TargetPath -Path $latestBackupPtr -Mode "Write"
        $ptrDir = Split-Path -Parent $effectivePtr
        if ($ptrDir -and -not (Test-Path -LiteralPath $ptrDir)) {
            [System.IO.Directory]::CreateDirectory($ptrDir) | Out-Null
        }
        [System.IO.File]::WriteAllText($effectivePtr, $backupDir, [System.Text.UTF8Encoding]::new($false))
        Invoke-SystemAction -ActionType "FileWrite" -Target $latestBackupPtr -Metadata @{ virtualPath = $effectivePtr; livePath = $latestBackupPtr }
        Write-Host "[DRYRUN] Wrote shadow backup manifest to $effectiveManifest"
    } elseif (-not $DryRun) {
        [System.IO.File]::WriteAllText($manifestFile, $manifestJson, [System.Text.UTF8Encoding]::new($false))
        [System.IO.File]::WriteAllText($latestBackupPtr, $backupDir, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Backup manifest recorded at: $manifestFile"
    } else {
        Write-Host "[DRYRUN] Would record backup manifest to $manifestFile"
    }
}

# 4. Prepare Target Directories & Symlinks / Files
Measure-InstallPhase -PhaseName "Target Dirs" -Block {
    Write-Host "`n[3/5] Initializing Target Runtime Directories..."
    $dirsToCreate = @(
        (Join-Path $userProfile ".config\komorebi"),
        (Join-Path $userProfile ".config\yasb"),
        (Join-Path $appData "FlowLauncher\Settings"),
        (Join-Path $appData "FlowLauncher\Themes")
    )
    foreach ($dirPath in $dirsToCreate) {
        New-DirectorySafely -Path $dirPath -DryRun:$DryRun
    }

    $appYamlSrc = Join-Path $workspaceRoot "configs/komorebi/applications.yaml"
    $appYamlDst = Join-Path $userProfile ".config\komorebi\applications.yaml"
    if (Test-Path -LiteralPath $appYamlSrc) {
        if (Test-IsDryRun) {
            $effectiveYamlDst = Resolve-TargetPath -Path $appYamlDst -Mode "Write"
            $yamlParent = Split-Path -Parent $effectiveYamlDst
            if ($yamlParent -and -not (Test-Path -LiteralPath $yamlParent)) {
                [System.IO.Directory]::CreateDirectory($yamlParent) | Out-Null
            }
            Copy-Item -LiteralPath $appYamlSrc -Destination $effectiveYamlDst -Force
            Invoke-SystemAction -ActionType "FileWrite" -Target $appYamlDst -Metadata @{ virtualPath = $effectiveYamlDst; livePath = $appYamlDst; source = $appYamlSrc }
            Write-Host "[DRYRUN] Installed applications.yaml -> $effectiveYamlDst (Live: $appYamlDst)"
        } elseif ($DryRun) {
            Write-Host "[DRYRUN] Copy $appYamlSrc -> $appYamlDst"
        } else {
            try {
                Copy-Item -LiteralPath $appYamlSrc -Destination $appYamlDst -Force
                Write-Host "Installed applications.yaml -> $appYamlDst"
            } catch {
                Write-Warning "Could not copy applications.yaml to ${appYamlDst}: $_"
            }
        }
    }
}

# 5. Compile and Synchronize Themes
Measure-InstallPhase -PhaseName "Theme Compilation" -Block {
    Write-Host "`n[4/5] Compiling and Synchronizing Theme Templates..."
    $syncThemeScript = Join-Path $workspaceRoot "scripts/sync-theme.ps1"
    if (Test-Path -LiteralPath $syncThemeScript) {
        & $syncThemeScript -Theme $Theme -DryRun:$DryRun -SandboxRoot $SandboxRoot
    }
}

# 6. Windhawk Mods Integration (Optional / Detected)
Measure-InstallPhase -PhaseName "Windhawk Injection" -Block {
    Write-Host "`n[5/5] Windhawk Shell & DWM Integration..."
    $windhawkScript = Join-Path $workspaceRoot "scripts/apply-windhawk-mods.ps1"
    if (Test-Path -LiteralPath $windhawkScript) {
        if ($rootlessMode) {
            Write-Host "Rootless mode active: applying native shell fallback (StuckRects3 taskbar auto-hide)..." -ForegroundColor Cyan
            & $windhawkScript -Action Load -NoAdmin -DryRun:$DryRun
        } elseif ($ApplyWindhawk) {
            Write-Host "Applying Windhawk mods..."
            & $windhawkScript -Action Load -DryRun:$DryRun
        } else {
            Write-Host "Windhawk mod application skipped (pass -ApplyWindhawk to enable)."
        }
    }
}

# 7. Final Ledger Export & Summary (if DryRun)
if ($DryRun) {
    if ($LedgerPath) {
        Export-ShadowLedger -OutputPath $LedgerPath | Out-Null
        Write-Host "`n[LEDGER] Exported execution ledger to: $LedgerPath" -ForegroundColor Green
    } else {
        $summaryLedger = Export-ShadowLedger
        Write-Host "`n[DRYRUN SUMMARY] Total Actions: $($summaryLedger.summary.totalActions), Files: $($summaryLedger.summary.filesWritten), Packages: $($summaryLedger.summary.packagesSimulated)" -ForegroundColor Cyan
    }
}

$totalStopwatch.Stop()
$phaseTimings["Total"] = $totalStopwatch.ElapsedMilliseconds

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "                Execution Telemetry Summary                     " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
$timingRows = foreach ($key in $phaseTimings.Keys) {
    [PSCustomObject]@{
        Phase           = $key
        "Duration (ms)" = $phaseTimings[$key]
        "Duration (s)"  = [math]::Round($phaseTimings[$key] / 1000, 2)
    }
}
$timingRows | Format-Table -AutoSize | Out-String | Write-Host -ForegroundColor White

Write-Host "================================================================"
Write-Host "  Installation and Provisioning Completed Successfully!         "
Write-Host "  To launch the environment, execute:                           "
Write-Host "    powershell -File .\scripts\watchdog.ps1 -Action Start       "
Write-Host "================================================================"
