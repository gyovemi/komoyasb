<#
.SYNOPSIS
    Compiles, loads, or unloads custom Windhawk mods for the komoyasb desktop environment.
.DESCRIPTION
    Provides automated orchestration for local Windhawk C++ mods:
    - taskbar-autohide
    - dwm-mica-effects
    - notification-styling
    Supports deployment (-Action Load), rollback (-Action Unload), and inspection (-Action Status / Compile)
    with full support for -DryRun / -WhatIf execution modes.
.PARAMETER Action
    The operation to perform: 'Load', 'Unload', 'Status', or 'Compile'. Defaults to 'Load'.
.PARAMETER ModId
    Target specific mod ID or 'All'. Defaults to 'All'.
.PARAMETER BackdropType
    Optional DWM backdrop material type (1=None, 2=Mica, 3=Acrylic, 4=MicaAlt).
.PARAMETER PerformanceProfile
    Optional performance profile name from which to read DWM parameters.
.PARAMETER NoAdmin
    Forces rootless execution mode without administrative rights.
    Automatically activates native shell fallback (Set-NativeTaskbarAutoHide via HKCU StuckRects3)
    and gracefully skips machine-level Windhawk injection.
.PARAMETER DryRun
    Simulates actions without invoking windhawk-cli.exe or writing to ProgramData.
.OUTPUTS
    None. Outputs operation status logs to console.
.EXAMPLE
    .\apply-windhawk-mods.ps1 -Action Load
.EXAMPLE
    .\apply-windhawk-mods.ps1 -Action Load -NoAdmin -DryRun
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet("Load", "Unload", "Status", "Compile")]
    [string]$Action = "Load",

    [ValidateSet("All", "taskbar-autohide", "dwm-mica-effects", "notification-styling")]
    [string]$ModId = "All",

    [ValidateRange(1, 4)]
    [int]$BackdropType = 0,

    [ValidateSet("ultra-low", "balanced", "visual-rich", "gaming", "custom", "")]
    [string]$PerformanceProfile = "",

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun) {
    $DryRun = $true
}

$cmdPath = if ($MyInvocation -and $MyInvocation.MyCommand -and ($MyInvocation.MyCommand.PSObject.Properties['Path'])) { $MyInvocation.MyCommand.Path } else { $null }
$scriptDir = if ($PSScriptRoot) {
    $PSScriptRoot
} elseif ($cmdPath) {
    Split-Path -Parent $cmdPath
} elseif (Get-Command "Get-WorkspaceRoot" -ErrorAction SilentlyContinue) {
    Join-Path (Get-WorkspaceRoot) "scripts"
} else {
    (Get-Location).Path
}

$coreHelpersDir = Join-Path $scriptDir "lib"
$envModule = Join-Path $coreHelpersDir "Environment.psm1"
if (Test-Path -LiteralPath $envModule) {
    Import-Module $envModule -Force
}

$isAdmin = if (Get-Command "Test-IsAdministrator" -ErrorAction SilentlyContinue) { Test-IsAdministrator } else { $false }
$isRootless = $NoAdmin -or (-not $isAdmin)

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

# Mod Definitions
$allMods = @(
    @{ Id = "taskbar-autohide";    SourceFile = "taskbar-autohide.wh.cpp";    Description = "Taskbar auto-hide and work area enforcer for Komorebi/YASB" },
    @{ Id = "dwm-mica-effects";    SourceFile = "dwm-mica-effects.wh.cpp";    Description = "DWM system backdrop and Mica effects enforcer" },
    @{ Id = "notification-styling"; SourceFile = "notification-styling.wh.cpp"; Description = "Windows notification and toast styling" }
)

$targetMods = if ($ModId -eq "All") { $allMods } else { @($allMods | Where-Object { $_.Id -eq $ModId }) }

$RepoRoot = if (Get-Command "Get-WorkspaceRoot" -ErrorAction SilentlyContinue) {
    Get-WorkspaceRoot
} elseif ($scriptDir) {
    $parent = Split-Path -Parent $scriptDir
    if ($parent) { $parent } else { (Get-Location).Path }
} else {
    (Get-Location).Path
}
if (-not $RepoRoot) {
    $RepoRoot = (Get-Location).Path
}

# Resolve mods source directory
$CandidateModsDirs = @(
    (Join-Path $RepoRoot "configs\shell\windhawk"),
    (Join-Path $scriptDir "windhawk_mods"),
    (Join-Path $RepoRoot "scripts\windhawk_mods")
)
$ModsSourceDir = Join-Path $scriptDir "windhawk_mods"
foreach ($dir in $CandidateModsDirs) {
    if (Test-Path -LiteralPath $dir) {
        $ModsSourceDir = (Resolve-Path $dir).Path
        break
    }
}

$ProgData = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
$ProgFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }

# Locate CLI
$WindhawkCli = $null
$candidateCliPaths = @(
    (Join-Path $ProgData "Windhawk\Engine\windhawk-cli.exe"),
    (Join-Path $ProgFiles "Windhawk\windhawk-cli.exe")
)
foreach ($p in $candidateCliPaths) {
    if (Test-Path -LiteralPath $p) {
        $WindhawkCli = $p
        break
    }
}
if (-not $WindhawkCli -and (Test-CommandAvailable -CommandName "windhawk-cli.exe")) {
    $WindhawkCli = (Get-Command "windhawk-cli.exe").Source
}

$WindhawkStorageModsDir = Join-Path $ProgData "Windhawk\Mods"

# Resolve DWM settings
$effectiveBackdropType = $BackdropType
$effectiveRoundedCorners = 0
$effectiveForceDarkMode = $null

if (-not $PerformanceProfile) {
    $currentPerf = Join-Path (Join-Path $RepoRoot "themes") ".current_perf"
    $perfJson = Join-Path $RepoRoot "performance.json"
    if (Test-Path -LiteralPath $currentPerf) {
        $PerformanceProfile = (Get-Content -LiteralPath $currentPerf -Raw).Trim()
    } elseif (Test-Path -LiteralPath $perfJson) {
        try {
            $perfObj = Get-Content -LiteralPath $perfJson -Raw | ConvertFrom-Json
            if ($perfObj.active_profile) { $PerformanceProfile = $perfObj.active_profile }
        } catch {}
    }
}

if ($PerformanceProfile) {
    $perfJson = Join-Path $RepoRoot "performance.json"
    if (Test-Path -LiteralPath $perfJson) {
        try {
            $perfObj = Get-Content -LiteralPath $perfJson -Raw | ConvertFrom-Json
            if ($perfObj.profiles -and $perfObj.profiles.PSObject.Properties[$PerformanceProfile] -and $perfObj.profiles.$PerformanceProfile.dwm) {
                $dwm = $perfObj.profiles.$PerformanceProfile.dwm
                if ($effectiveBackdropType -eq 0 -and $dwm.backdrop_type) { $effectiveBackdropType = [int]$dwm.backdrop_type }
                if ($dwm.rounded_corners) { $effectiveRoundedCorners = [int]$dwm.rounded_corners }
                if ($null -ne $dwm.force_dark_mode) { $effectiveForceDarkMode = [bool]$dwm.force_dark_mode }
            }
        } catch {
            Write-Warning "Could not read DWM performance settings for '$PerformanceProfile': $_"
        }
    }
}

Write-Host "=== komoyasb Windhawk Mod Manager ===" -ForegroundColor Cyan
Write-Host "Action   : $Action" -ForegroundColor Gray
Write-Host "Mod Target : $ModId" -ForegroundColor Gray
if ($PerformanceProfile) { Write-Host "Perf Profile : $PerformanceProfile" -ForegroundColor Gray }
if ($effectiveBackdropType -gt 0) { Write-Host "BackdropType : $effectiveBackdropType" -ForegroundColor Gray }
Write-Host "DryRun   : $DryRun" -ForegroundColor Gray
Write-Host "Privilege: $(if ($isRootless) { 'Rootless (Non-Admin)' } else { 'Elevated (Administrator)' })" -ForegroundColor Gray
Write-Host "CLI Path : $(if ($WindhawkCli) { $WindhawkCli } else { 'Not Detected (Fallback Mode)' })" -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan

function Set-NativeTaskbarAutoHide {
    <#
    .SYNOPSIS
        Toggles native Windows 11 taskbar auto-hide without third-party drivers or administrator rights.
    .DESCRIPTION
        Mutates byte index 8 in registry value HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3\Settings.
        0x03 enables auto-hide; 0x02 disables auto-hide. Restarts or notifies explorer.exe cleanly.
    .PARAMETER Enable
        True to enable taskbar auto-hide (0x03), false to disable (0x02).
    .PARAMETER DryRun
        Simulates registry modification without altering host state.
    .OUTPUTS
        None.
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Enable,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )

    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3"
    $valName = "Settings"
    $effectiveDry = $DryRun -or $isDry

    if ($effectiveDry) {
        if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
            Invoke-SystemAction -ActionType "RegistryWrite" -Target "$regPath" -Metadata @{
                Action     = "TaskbarAutoHide"
                ValueName  = $valName
                FullTarget = "$regPath\$valName"
                Enable     = $Enable
                TargetByte = if ($Enable) { "0x03" } else { "0x02" }
            }
        }
        Write-Host "[DRYRUN] Set taskbar auto-hide ($Enable) via HKCU StuckRects3" -ForegroundColor Cyan
        return
    }

    try {
        $bytes = (Get-ItemProperty -Path $regPath -Name $valName -ErrorAction Stop).$valName
        if ($bytes -and $bytes.Length -ge 9) {
            $bytes[8] = if ($Enable) { [byte]0x03 } else { [byte]0x02 }
            Set-ItemProperty -Path $regPath -Name $valName -Value $bytes -ErrorAction Stop
            # Signal Windows Shell to reload taskbar state
            Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
            Write-Host "[komoyasb] Native taskbar auto-hide applied ($Enable) via HKCU StuckRects3." -ForegroundColor Green
        }
    } catch {
        Write-Warning "Could not update StuckRects3 taskbar setting: $_"
    }
}

function Invoke-WindhawkCommand {
    param(
        [string]$CliPath,
        [string[]]$Arguments,
        [string]$Description,
        [string]$TargetMod = ""
    )

    if ($isDry) {
        if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
            $effectiveTarget = if ($TargetMod) { $TargetMod } else { $Description }
            [void](Invoke-SystemAction -ActionType "WindhawkMod" -Target $effectiveTarget -Metadata @{
                CliPath = $CliPath
                Arguments = $Arguments -join " "
                Description = $Description
            })
        }
        Write-Host "[DryRun] Would execute: $CliPath $Arguments ($Description)" -ForegroundColor Yellow
        return $true
    }

    if (-not $CliPath -or -not (Test-Path $CliPath)) {
        Write-Warning "Windhawk CLI not available at '$CliPath'. Cannot execute: $Arguments"
        return $false
    }

    Write-Host "Executing: $CliPath $Arguments ($Description)..." -ForegroundColor Green
    try {
        $p = Start-Process -FilePath $CliPath -ArgumentList $Arguments -NoNewWindow -Wait -PassThru
        if ($p.ExitCode -eq 0) {
            Write-Host "Success: $Description" -ForegroundColor Green
            return $true
        }
        Write-Warning "Process exited with code $($p.ExitCode): $Description"
        return $false
    } catch {
        Write-Error "Failed to execute Windhawk CLI: $_"
        return $false
    }
}

$cliTarget = if ($WindhawkCli) { $WindhawkCli } else { "windhawk-cli.exe" }

switch ($Action) {
    "Load" {
        if ($isRootless -or (-not $WindhawkCli -and -not (Test-CommandAvailable -CommandName "windhawk-cli.exe"))) {
            Write-Host "`n[Rootless / Windhawk Absent] Activating native shell fallback (StuckRects3 taskbar auto-hide)..." -ForegroundColor Cyan
            Set-NativeTaskbarAutoHide -Enable $true -DryRun:$isDry
            Write-Host "[komoyasb] Native taskbar auto-hide fallback applied. Machine-level Windhawk injection skipped." -ForegroundColor Green
            return
        }

        Write-Host "`n[+] Loading Windhawk Mods..." -ForegroundColor Cyan
        foreach ($mod in $targetMods) {
            $srcPath = Join-Path $ModsSourceDir $mod.SourceFile
            if (-not (Test-Path -LiteralPath $srcPath)) {
                Write-Warning "Mod source file missing: $srcPath"
                continue
            }

            Write-Host "`nProcessing Mod: $($mod.Id) ($($mod.Description))" -ForegroundColor White
            $effectiveStorageDir = if ($isDry -and (Get-Command "Resolve-TargetPath" -ErrorAction SilentlyContinue)) {
                Resolve-TargetPath -Path $WindhawkStorageModsDir -Mode "Write"
            } else {
                $WindhawkStorageModsDir
            }
            $targetFile = Join-Path $effectiveStorageDir $mod.SourceFile
            $liveTargetFile = Join-Path $WindhawkStorageModsDir $mod.SourceFile

            $sourceHash = Get-Sha256Hash -Path $srcPath
            $checkFile = if ($isDry) { $targetFile } else { $liveTargetFile }
            if ((Test-Path -LiteralPath $checkFile) -and ((Get-Sha256Hash -Path $checkFile) -eq $sourceHash)) {
                Write-Host "Mod $($mod.Id) is already staged with matching SHA-256. Skipping load." -ForegroundColor Green
                continue
            }

            if ($isDry) {
                if (-not (Test-Path -LiteralPath $effectiveStorageDir)) {
                    [System.IO.Directory]::CreateDirectory($effectiveStorageDir) | Out-Null
                }
                Copy-Item -LiteralPath $srcPath -Destination $targetFile -Force
                if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
                    Invoke-SystemAction -ActionType "FileWrite" -Target $liveTargetFile -Metadata @{ virtualPath = $targetFile; livePath = $liveTargetFile; modId = $mod.Id }
                }
                Write-Host "[DryRun] Staged mod source to shadow ProgramData: $targetFile" -ForegroundColor Yellow
            } else {
                try {
                    if (Test-Path -LiteralPath $ProgData) {
                        if (-not (Test-Path -LiteralPath $WindhawkStorageModsDir)) {
                            New-Item -ItemType Directory -Path $WindhawkStorageModsDir -Force -ErrorAction Stop | Out-Null
                        }
                        Copy-Item -LiteralPath $srcPath -Destination $liveTargetFile -Force -ErrorAction Stop
                    }
                } catch {
                    Write-Warning "Could not stage mod source to '$WindhawkStorageModsDir': $_"
                }
            }

            Invoke-WindhawkCommand -CliPath $cliTarget -Arguments @("-load-mod", $mod.Id, "-mod-source", $srcPath) -Description "Load $($mod.Id)" -TargetMod $mod.Id

            if ($mod.Id -eq "dwm-mica-effects" -and ($effectiveBackdropType -gt 0 -or $effectiveRoundedCorners -gt 0 -or $null -ne $effectiveForceDarkMode)) {
                $settingArgs = @("mod", "settings", "set", "dwm-mica-effects")
                $settingsSummary = @()
                if ($effectiveBackdropType -gt 0) {
                    $settingArgs += "backdrop_type=$effectiveBackdropType"
                    $settingsSummary += "backdrop_type=$effectiveBackdropType"
                }
                if ($effectiveRoundedCorners -gt 0) {
                    $settingArgs += "rounded_corners=$effectiveRoundedCorners"
                    $settingsSummary += "rounded_corners=$effectiveRoundedCorners"
                }
                if ($null -ne $effectiveForceDarkMode) {
                    $val = if ($effectiveForceDarkMode) { "true" } else { "false" }
                    $settingArgs += "force_dark_mode=$val"
                    $settingsSummary += "force_dark_mode=$val"
                }
                Invoke-WindhawkCommand -CliPath $cliTarget -Arguments $settingArgs -Description "Configure dwm-mica-effects settings ($($settingsSummary -join ', '))" -TargetMod $mod.Id
            }
        }
    }
    "Unload" {
        Write-Host "`n[-] Unloading Windhawk Mods & Restoring Shell Defaults..." -ForegroundColor Cyan
        Set-NativeTaskbarAutoHide -Enable $false -DryRun:$isDry
        if (-not $isRootless -and ($WindhawkCli -or (Test-CommandAvailable -CommandName "windhawk-cli.exe"))) {
            foreach ($mod in $targetMods) {
                Write-Host "`nUnloading Mod: $($mod.Id)" -ForegroundColor White
                Invoke-WindhawkCommand -CliPath $cliTarget -Arguments @("-unload-mod", $mod.Id) -Description "Unload $($mod.Id)" -TargetMod $mod.Id
            }
        }
    }
    "Compile" {
        Write-Host "`n[*] Compiling Windhawk Mods..." -ForegroundColor Cyan
        foreach ($mod in $targetMods) {
            $srcPath = Join-Path $ModsSourceDir $mod.SourceFile
            Invoke-WindhawkCommand -CliPath $cliTarget -Arguments @("-compile-mod", $srcPath) -Description "Compile $($mod.Id)" -TargetMod $mod.Id
        }
    }
    "Status" {
        Write-Host "`n[?] Querying Windhawk Mods Status..." -ForegroundColor Cyan
        if ($WindhawkCli -or $isDry) {
            Invoke-WindhawkCommand -CliPath $cliTarget -Arguments @("-status") -Description "Query Status"
        } else {
            Write-Host "Windhawk CLI not found. Managed mod definitions:" -ForegroundColor Yellow
            $targetMods | Format-Table Id, SourceFile, Description
        }
    }
}

Write-Host "`n=== Completed Windhawk Action: $Action ===`n" -ForegroundColor Cyan
