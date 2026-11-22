<#
.SYNOPSIS
    Reverts and uninstalls the komoyasb desktop environment, performing a complete 1-command rollback.
.DESCRIPTION
    Rollback engine:
    1. Terminates all active komoyasb processes (komorebi, whkd, yasb, watchdog).
    2. Unloads Windhawk mods (restoring standard Windows 11 taskbar and DWM composition).
    3. Restores original user configuration files from the latest (or specified) timestamped backup.
    4. Removes generated runtime files and symlinks.
    5. Optionally removes installed packages via winget.
    6. Fully supports -DryRun and -WhatIf.
.PARAMETER BackupDir
    Explicit path to a backup directory containing manifest.json.
    If omitted, resolves the most recent backup recorded in themes/.latest_backup.txt.
.PARAMETER RemovePackages
    When set, attempts to uninstall winget packages (komorebi, whkd, yasb, etc.).
.PARAMETER NoAdmin
    Forces rootless rollback mode without administrative privileges.
    Automatically enabled when not running with elevated Administrator privileges.
.PARAMETER DryRun
    Simulates all rollback operations without terminating processes or modifying files.
.PARAMETER SandboxRoot
    Shadow sandbox directory to operate within when DryRun is active.
.PARAMETER KeepSandbox
    Retains shadow execution sandbox directory after completion.
.OUTPUTS
    None. Outputs console progress and status updates.
.EXAMPLE
    .\uninstall.ps1 -DryRun
.EXAMPLE
    .\uninstall.ps1 -RemovePackages
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false)]
    [string]$BackupDir = "",

    [Parameter(Mandatory = $false)]
    [switch]$RemovePackages,

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [string]$SandboxRoot = "",

    [Parameter(Mandatory = $false)]
    [switch]$KeepSandbox
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun) {
    $DryRun = $true
}

$coreHelpersDir = Join-Path $PSScriptRoot "scripts\lib"
Import-Module (Join-Path $coreHelpersDir "Environment.psm1") -Force

# Privilege resolution:
$isAdmin = Test-IsAdministrator
$rootlessMode = $NoAdmin -or (-not $isAdmin)

if ($rootlessMode) {
    Write-Host "[komoyasb] Operating in ROOTLESS MODE (Non-Admin / Zero-UAC)." -ForegroundColor Cyan
} else {
    Write-Host "[komoyasb] Operating in ELEVATED MODE (Administrator)." -ForegroundColor Yellow
}

if ($DryRun) {
    $existingCtx = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    if (-not $existingCtx -or -not $existingCtx.Value -or -not $existingCtx.Value.Active) {
        Initialize-ShadowContext -ShadowRoot $SandboxRoot -KeepSandbox:$KeepSandbox | Out-Null
    }
}

$workspaceRoot = Get-WorkspaceRoot
Write-Host "================================================================"
Write-Host "  komoyasb Desktop Environment Rollback & Uninstaller           "
Write-Host "================================================================"
Write-Host "Workspace Root : $workspaceRoot"
Write-Host "DryRun Mode    : $DryRun"
Write-Host "Privilege Mode : $(if ($rootlessMode) { 'ROOTLESS (Non-Admin / Zero-UAC)' } else { 'ELEVATED (Administrator)' })"
Write-Host "----------------------------------------------------------------"

# 1. Terminate All Running Desktop Environment Processes
Write-Host "`n[1/4] Terminating Running Subsystem Processes..."
$watchdogScript = Join-Path $workspaceRoot "scripts/watchdog.ps1"
if (Test-Path -LiteralPath $watchdogScript) {
    & $watchdogScript -Action Stop -DryRun:$DryRun
} else {
    Write-Host "Stopping managed processes (yasb, whkd, komorebi)..."
    foreach ($proc in @("yasb", "whkd", "komorebi")) {
        if ($DryRun) {
            Invoke-SystemAction -ActionType "ProcessControl" -Target $proc -Metadata @{ Action = "Stop"; ProcessName = $proc }
            Write-Host "[DRYRUN] Stop-Process -Name $proc"
        } else {
            Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }
}

# 2. Unload Windhawk Mods
Write-Host "`n[2/4] Unloading Windhawk Mods & Restoring Shell Defaults..."
$windhawkScript = Join-Path $workspaceRoot "scripts/apply-windhawk-mods.ps1"
if (Test-Path -LiteralPath $windhawkScript) {
    try { & $windhawkScript -Action Unload -NoAdmin:$rootlessMode -DryRun:$DryRun }
    catch { Write-Warning "Failed unloading Windhawk mods: $_" }
} else {
    Write-Host "apply-windhawk-mods.ps1 not found; skipping mod unloading."
}

# Helper to clean up deployed runtime files
function Remove-ManagedRuntimeFiles {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([switch]$DryRun)

    Write-Host "Cleaning up runtime files deployed by komoyasb..."
    $userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
    $appData = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }

    $filesToRemove = @(
        (Join-Path $userProfile ".config\komorebi\komorebi.json"),
        (Join-Path $userProfile ".config\komorebi\applications.yaml"),
        (Join-Path $userProfile ".config\whkdrc"),
        (Join-Path $userProfile ".config\yasb\config.yaml"),
        (Join-Path $userProfile ".config\yasb\styles.css"),
        (Join-Path $appData "FlowLauncher\Settings\Settings.json"),
        (Join-Path $appData "FlowLauncher\Themes\KomoyasbFluent.xaml"),
        (Join-Path $workspaceRoot "themes\.current_perf"),
        (Join-Path $workspaceRoot "themes\.current_theme")
    )

    foreach ($targetFile in $filesToRemove) {
        $targetToDelete = if (Test-IsDryRun) { Resolve-TargetPath -Path $targetFile -Mode "Write" } else { $targetFile }
        $fileExists = Test-Path -LiteralPath $targetToDelete -ErrorAction SilentlyContinue

        if ($fileExists) {
            if (Test-IsDryRun) {
                Remove-Item -LiteralPath $targetToDelete -Force -ErrorAction SilentlyContinue
                Invoke-SystemAction -ActionType "FileDelete" -Target $targetFile -Metadata @{
                    virtualPath = $targetToDelete
                    livePath = $targetFile
                }
                Write-Host "[DRYRUN] Removed shadow runtime file: $targetToDelete (Live: $targetFile)"
            } elseif ($DryRun) {
                Write-Host "[DRYRUN] Remove-Item $targetFile"
            } else {
                try {
                    Remove-Item -LiteralPath $targetFile -Force -ErrorAction SilentlyContinue
                    Write-Host "Removed runtime file: $targetFile"
                } catch {
                    Write-Warning "Could not remove file ${targetFile}: $_"
                }
            }
        }
    }
}

# 3. Locate and Restore Backups
Write-Host "`n[3/4] Restoring Original User Configurations..."
$selectedBackupDir = $BackupDir
$latestBackupPointer = Join-Path (Join-Path $workspaceRoot "themes") ".latest_backup.txt"

# Path traversal guard for explicitly provided BackupDir
if ($selectedBackupDir) {
    if ($selectedBackupDir -match '\.\.[/\\]' -or $selectedBackupDir -match '[/\\]\.\.' -or $selectedBackupDir.StartsWith("..")) {
        throw "Security violation: Path traversal token '..' detected in BackupDir: '$selectedBackupDir'."
    }
} else {
    $effectivePointer = if (Test-IsDryRun) { Resolve-TargetPath -Path $latestBackupPointer -Mode "Read" } else { $latestBackupPointer }
    if (Test-Path -LiteralPath $effectivePointer) {
        $selectedBackupDir = (Get-Content -LiteralPath $effectivePointer -Raw).Trim()
    }
}

$manifestRestoredSuccessfully = $false

if ($selectedBackupDir) {
    # Validate selected backup directory boundaries
    $userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
    $appData = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
    $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }
    $allowedRoots = @($workspaceRoot, $userProfile, $appData, $localAppData, [System.IO.Path]::GetTempPath())

    $canonicalSelected = [System.IO.Path]::GetFullPath($selectedBackupDir)
    $isAllowed = $false
    foreach ($r in $allowedRoots) {
        $canRoot = [System.IO.Path]::GetFullPath($r)
        if ($canonicalSelected.StartsWith($canRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $isAllowed = $true
            break
        }
    }
    if (-not $isAllowed) {
        throw "Security violation: BackupDir '$selectedBackupDir' resolves outside permitted directories."
    }

    $effectiveBackupDir = if (Test-IsDryRun) { Resolve-TargetPath -Path $selectedBackupDir -Mode "Read" } else { $selectedBackupDir }
    $manifestPath = Join-Path $effectiveBackupDir "manifest.json"
    $manifest = $null

    if (Test-Path -LiteralPath $manifestPath) {
        try {
            $manifestRaw = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
            if (-not [string]::IsNullOrWhiteSpace($manifestRaw)) {
                $manifest = $manifestRaw | ConvertFrom-Json
            } else {
                Write-Warning "Backup manifest at '$manifestPath' is empty (0 bytes)."
            }
        } catch {
            Write-Warning "Backup manifest at '$manifestPath' is corrupted or invalid JSON: $_"
            $manifest = $null
        }
    } else {
        Write-Warning "Backup manifest not found in '$effectiveBackupDir'."
    }

    if ($manifest -and $manifest.PSObject.Properties['Backups'] -and $null -ne $manifest.Backups) {
        $backupEntries = @($manifest.Backups)
        if ($backupEntries.Count -gt 0) {
            Write-Host "Restoring backups from timestamp: $($manifest.Timestamp) ($effectiveBackupDir)"
            $restoredAny = $false

            foreach ($entry in $backupEntries) {
                $origPath = $entry.Original
                $backupFile = $entry.Backup

                if (-not $origPath -or -not $backupFile) { continue }

                # Guard against path traversal inside backup manifest entries
                if ($origPath -match '\.\.[/\\]' -or $origPath -match '[/\\]\.\.' -or
                    $backupFile -match '\.\.[/\\]' -or $backupFile -match '[/\\]\.\.') {
                    Write-Warning "Skipping suspicious backup entry containing path traversal: '$origPath' / '$backupFile'"
                    continue
                }

                $effectiveBackupFile = if (Test-IsDryRun) { Resolve-TargetPath -Path $backupFile -Mode "Read" } else { $backupFile }

                if (Test-Path -LiteralPath $effectiveBackupFile) {
                    if (Test-IsDryRun) {
                        $effectiveOrigPath = Resolve-TargetPath -Path $origPath -Mode "Write"
                        $parentDir = Split-Path -Parent $effectiveOrigPath
                        if ($parentDir -and -not (Test-Path -LiteralPath $parentDir)) {
                            [System.IO.Directory]::CreateDirectory($parentDir) | Out-Null
                        }
                        Copy-Item -LiteralPath $effectiveBackupFile -Destination $effectiveOrigPath -Force
                        Invoke-SystemAction -ActionType "FileWrite" -Target $origPath -Metadata @{
                            virtualPath = $effectiveOrigPath
                            livePath = $origPath
                            restoredFrom = $backupFile
                        }
                        Write-Host "[DRYRUN] Restore $effectiveBackupFile -> $effectiveOrigPath (Live: $origPath)"
                        $restoredAny = $true
                    } elseif ($DryRun) {
                        Write-Host "[DRYRUN] Restore $backupFile -> $origPath"
                        $restoredAny = $true
                    } else {
                        $parentDir = Split-Path -Parent $origPath
                        if (-not (Test-Path -LiteralPath $parentDir)) {
                            [System.IO.Directory]::CreateDirectory($parentDir) | Out-Null
                        }
                        Copy-Item -LiteralPath $backupFile -Destination $origPath -Force
                        Write-Host "Restored: $origPath"
                        $restoredAny = $true
                    }
                }
            }

            if ($restoredAny) {
                $manifestRestoredSuccessfully = $true
            }
        }
    }

    if (-not $manifestRestoredSuccessfully) {
        Write-Warning "Could not restore configurations from backup manifest in '$effectiveBackupDir'. Falling back to clean removal of runtime deployment targets."
        Remove-ManagedRuntimeFiles -DryRun:$DryRun
    }
} else {
    Write-Host "No prior backup records found."
    Remove-ManagedRuntimeFiles -DryRun:$DryRun
}

# 4. Optional Package Removal
Write-Host "`n[4/4] Package De-provisioning..."
if ($RemovePackages) {
    $packagesToUninstall = @(
        "LGUG2Z.komorebi",
        "LGUG2Z.whkd",
        "AmN.yasb",
        "Flow-Launcher.Flow-Launcher",
        "RamenSoftware.Windhawk",
        "File-New-Project.EarTrumpet"
    )

    foreach ($packageIdentifier in $packagesToUninstall) {
        if (Test-WingetPackageInstalled -PackageId $packageIdentifier) {
            if ((Test-IsDryRun) -or $DryRun) {
                [void](Invoke-SystemAction -ActionType "PackageInstall" -Target $packageIdentifier -Metadata @{
                    Action = "Uninstall"
                    PackageId = $packageIdentifier
                })
                Write-Host "[DRYRUN] winget uninstall --exact --id $packageIdentifier"
            } else {
                Write-Host "Uninstalling package: $packageIdentifier..."
                try {
                    $uninstallProcess = Start-Process -FilePath "winget" -ArgumentList @("uninstall", "--exact", "--id", $packageIdentifier, "--accept-source-agreements") -NoNewWindow -Wait -PassThru
                    if ($uninstallProcess.ExitCode -ne 0) {
                        Write-Warning "Winget uninstall of $packageIdentifier returned exit code $($uninstallProcess.ExitCode)"
                    }
                }
                catch {
                    Write-Warning "Failed to uninstall $packageIdentifier via winget: $_"
                }
            }
        }
    }
} else {
    Write-Host "Package de-provisioning skipped (pass -RemovePackages to uninstall tools)."
}

Write-Host "`n================================================================"
Write-Host "  Rollback Complete! System restored to pre-komoyasb state.      "
Write-Host "================================================================"
