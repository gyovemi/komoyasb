<#
.SYNOPSIS
    Applies or restores OS-level performance tweaks for the komoyasb desktop environment.
.DESCRIPTION
    Manages operating system process priorities, Win32 EcoQoS (Execution Speed Throttling),
    and Windows GUI animation flags based on the active or requested performance profile.
.PARAMETER Profile
    Target performance profile ('ultra-low', 'balanced', 'visual-rich', 'gaming').
.PARAMETER Action
    'Apply' (default) or 'Restore' (resets to Windows OS defaults: Normal priority, EcoQoS disabled, animations on).
.PARAMETER DryRun
    Simulates changes without modifying live OS processes or Windows parameters.
.OUTPUTS
    None. Outputs operation status logs to console.
.EXAMPLE
    .\Set-OsPerformance.ps1 -Profile gaming
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet("ultra-low", "balanced", "visual-rich", "gaming", "custom")]
    [string]$Profile,

    [Parameter(Mandatory = $false)]
    [ValidateSet("Apply", "Restore")]
    [string]$Action = "Apply",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSCmdlet.ShouldProcess("OS Performance Settings", "$Action Performance Tweaks")) {}
if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun) {
    $DryRun = $true
}

$coreHelpersDir = Join-Path $PSScriptRoot "lib"
$envModule = Join-Path $coreHelpersDir "Environment.psm1"
if (Test-Path -LiteralPath $envModule) {
    Import-Module $envModule -Force
}

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

# Register Win32 P/Invoke types if not already loaded
if (-not ([System.Management.Automation.PSTypeName]'Win32PowerThrottlingNative').Type) {
    $nativeCode = @'
using System;
using System.Runtime.InteropServices;

public static class Win32PowerThrottlingNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_POWER_THROTTLING_STATE {
        public uint Version;
        public uint ControlMask;
        public uint StateMask;
    }

    public const uint ProcessPowerThrottling = 4;
    public const uint PROCESS_POWER_THROTTLING_CURRENT_VERSION = 1;
    public const uint PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1;

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetProcessInformation(
        IntPtr hProcess,
        uint ProcessInformationClass,
        ref PROCESS_POWER_THROTTLING_STATE ProcessInformation,
        uint ProcessInformationSize
    );

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(
        uint uiAction,
        uint uiParam,
        IntPtr pvParam,
        uint fWinIni
    );

    public const uint SPI_SETCLIENTAREAANIMATION = 0x1043;
    public const uint SPIF_UPDATEINIFILE = 0x01;
    public const uint SPIF_SENDCHANGE = 0x02;
}
'@
    try {
        Add-Type -TypeDefinition $nativeCode -ErrorAction Stop
    } catch {
        Write-Warning "Could not register Win32PowerThrottlingNative: $_"
    }
}

function Invoke-OsAction {
    param(
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][hashtable]$Metadata,
        [Parameter(Mandatory = $false)][string]$Description = ""
    )

    if ($isDry) {
        if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
            Invoke-SystemAction -ActionType "ProcessControl" -Target $Target -Metadata $Metadata
        }
        Write-Host "[DryRun] $Description (Target: $Target, Details: $($Metadata | ConvertTo-Json -Compress))" -ForegroundColor Yellow
        return $true
    }
    return $false
}

function Set-ProcessEcoQoS {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][bool]$Enable
    )

    $meta = @{ Action = "EcoQoS"; ProcessName = $Process.ProcessName; ProcessId = $Process.Id; Enable = $Enable }
    if (Invoke-OsAction -Target "EcoQoS-$($Process.ProcessName)" -Metadata $meta -Description "Set EcoQoS ($Enable) on $($Process.ProcessName)") { return }

    if (-not ([System.Management.Automation.PSTypeName]'Win32PowerThrottlingNative').Type) {
        Write-Warning "Win32PowerThrottlingNative not available; skipping EcoQoS for $($Process.ProcessName)"
        return
    }

    try {
        $throttling = New-Object Win32PowerThrottlingNative+PROCESS_POWER_THROTTLING_STATE
        $throttling.Version = [Win32PowerThrottlingNative]::PROCESS_POWER_THROTTLING_CURRENT_VERSION
        $throttling.ControlMask = [Win32PowerThrottlingNative]::PROCESS_POWER_THROTTLING_EXECUTION_SPEED
        $throttling.StateMask = if ($Enable) { [Win32PowerThrottlingNative]::PROCESS_POWER_THROTTLING_EXECUTION_SPEED } else { [uint32]0 }

        $size = [System.Runtime.InteropServices.Marshal]::SizeOf($throttling)
        $success = [Win32PowerThrottlingNative]::SetProcessInformation(
            $Process.Handle,
            [Win32PowerThrottlingNative]::ProcessPowerThrottling,
            [ref]$throttling,
            [uint32]$size
        )

        if ($success) {
            Write-Host "Set EcoQoS ($Enable) on $($Process.ProcessName) (PID: $($Process.Id))" -ForegroundColor Green
        } else {
            $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
            Write-Warning "Failed setting EcoQoS on $($Process.ProcessName) (Win32 Error: $err)"
        }
    } catch {
        Write-Warning "Exception setting EcoQoS on $($Process.ProcessName): $_"
    }
}

function Set-ProcessPrioritySafe {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$PriorityName
    )

    $meta = @{ Action = "PriorityClass"; ProcessName = $Process.ProcessName; ProcessId = $Process.Id; PriorityClass = $PriorityName }
    if (Invoke-OsAction -Target "Priority-$($Process.ProcessName)" -Metadata $meta -Description "Set PriorityClass ($PriorityName) on $($Process.ProcessName)") { return }

    try {
        $Process.PriorityClass = [System.Enum]::Parse([System.Diagnostics.ProcessPriorityClass], $PriorityName, $true)
        Write-Host "Set PriorityClass ($PriorityName) on $($Process.ProcessName) (PID: $($Process.Id))" -ForegroundColor Green
    } catch {
        Write-Warning "Failed setting PriorityClass on $($Process.ProcessName): $_"
    }
}

function Set-WindowsClientAreaAnimationSafe {
    param([Parameter(Mandatory = $true)][bool]$Enabled)

    $meta = @{ Action = "WindowsAnimation"; Enabled = $Enabled }
    if (Invoke-OsAction -Target "WindowsAnimation" -Metadata $meta -Description "Set SPI_SETCLIENTAREAANIMATION ($Enabled)") { return }

    if (-not ([System.Management.Automation.PSTypeName]'Win32PowerThrottlingNative').Type) {
        Write-Warning "Win32PowerThrottlingNative not available; skipping animation setting"
        return
    }

    try {
        $val = if ($Enabled) { [IntPtr]1 } else { [IntPtr]::Zero }
        $flags = [uint32]([Win32PowerThrottlingNative]::SPIF_UPDATEINIFILE -bor [Win32PowerThrottlingNative]::SPIF_SENDCHANGE)
        $success = [Win32PowerThrottlingNative]::SystemParametersInfo(
            [uint32][Win32PowerThrottlingNative]::SPI_SETCLIENTAREAANIMATION,
            [uint32]0,
            $val,
            $flags
        )
        if ($success) {
            Write-Host "Set Windows Client Area Animation to $Enabled" -ForegroundColor Green
        } else {
            $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
            Write-Warning "Failed setting Windows animation parameter (Win32 Error: $err)"
        }
    } catch {
        Write-Warning "Exception setting Windows animation: $_"
    }
}

function Apply-ProcessTweak {
    param(
        [string]$ProcessName,
        [string]$Priority,
        [bool]$EcoQoS
    )
    $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
    if ($isDry -and $procs.Count -eq 0) {
        if ($Priority) {
            Invoke-OsAction -Target "Priority-$ProcessName" -Metadata @{ Action = "PriorityClass"; ProcessName = $ProcessName; PriorityClass = $Priority } -Description "Set PriorityClass ($Priority) on $ProcessName" | Out-Null
        }
        Invoke-OsAction -Target "EcoQoS-$ProcessName" -Metadata @{ Action = "EcoQoS"; ProcessName = $ProcessName; Enable = $EcoQoS } -Description "Set EcoQoS ($EcoQoS) on $ProcessName" | Out-Null
        return
    }
    foreach ($p in $procs) {
        if ($Priority) { Set-ProcessPrioritySafe -Process $p -PriorityName $Priority }
        Set-ProcessEcoQoS -Process $p -Enable $EcoQoS
    }
}

$RepoRoot = if (Get-Command "Get-WorkspaceRoot" -ErrorAction SilentlyContinue) { Get-WorkspaceRoot } else { Split-Path -Parent $PSScriptRoot }

Write-Host "=== komoyasb OS Performance Optimizer ===" -ForegroundColor Cyan
Write-Host "Action  : $Action" -ForegroundColor Gray
Write-Host "DryRun  : $isDry" -ForegroundColor Gray

if ($Action -eq "Restore") {
    Write-Host "`n[*] Restoring OS process priorities and clearing EcoQoS..." -ForegroundColor Cyan
    foreach ($pName in @("komorebi", "yasb", "watchdog", "whkd")) {
        Apply-ProcessTweak -ProcessName $pName -Priority "Normal" -EcoQoS $false
    }
    Set-WindowsClientAreaAnimationSafe -Enabled $true
    Write-Host "`n=== Completed OS Performance Restore ===`n" -ForegroundColor Cyan
    return
}

# Resolve target profile
if (-not $Profile) {
    $currentPerfPointer = Join-Path (Join-Path $RepoRoot "themes") ".current_perf"
    $perfJsonPath = Join-Path $RepoRoot "performance.json"
    if (Test-Path -LiteralPath $currentPerfPointer) {
        $Profile = (Get-Content -LiteralPath $currentPerfPointer -Raw).Trim()
    } elseif (Test-Path -LiteralPath $perfJsonPath) {
        try {
            $perfConfig = Get-Content -LiteralPath $perfJsonPath -Raw | ConvertFrom-Json
            if ($perfConfig.active_profile) { $Profile = $perfConfig.active_profile }
        } catch {}
    }
    if (-not $Profile) { $Profile = "balanced" }
}

Write-Host "Profile : $Profile" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan

# Fallback definitions table
$profileFallbacks = @{
    "ultra-low"   = [PSCustomObject]@{ background_eco_qos = $true;  komorebi_priority = "Normal";      yasb_priority = "BelowNormal"; disable_windows_animations = $true  }
    "visual-rich" = [PSCustomObject]@{ background_eco_qos = $false; komorebi_priority = "Normal";      yasb_priority = "Normal";      disable_windows_animations = $false }
    "gaming"      = [PSCustomObject]@{ background_eco_qos = $false; komorebi_priority = "AboveNormal"; yasb_priority = "Idle";       disable_windows_animations = $true  }
    "balanced"    = [PSCustomObject]@{ background_eco_qos = $false; komorebi_priority = "Normal";      yasb_priority = "Normal";      disable_windows_animations = $false }
}

$perfJsonPath = Join-Path $RepoRoot "performance.json"
$osConfig = $null
if (Test-Path -LiteralPath $perfJsonPath) {
    try {
        $perfConfig = Get-Content -LiteralPath $perfJsonPath -Raw | ConvertFrom-Json
        if ($perfConfig.profiles -and $perfConfig.profiles.$Profile -and $perfConfig.profiles.$Profile.os) {
            $osConfig = $perfConfig.profiles.$Profile.os
        }
    } catch {
        Write-Warning "Could not parse performance.json: $_"
    }
}
if (-not $osConfig) {
    $osConfig = if ($profileFallbacks.ContainsKey($Profile)) { $profileFallbacks[$Profile] } else { $profileFallbacks["balanced"] }
}

Write-Host "`n[+] Applying OS Performance Tweaks for profile '$Profile'..." -ForegroundColor Cyan

Apply-ProcessTweak -ProcessName "komorebi" -Priority ([string]$osConfig.komorebi_priority) -EcoQoS $false
Apply-ProcessTweak -ProcessName "yasb" -Priority ([string]$osConfig.yasb_priority) -EcoQoS ([bool]$osConfig.background_eco_qos)
Apply-ProcessTweak -ProcessName "watchdog" -Priority "Normal" -EcoQoS ([bool]$osConfig.background_eco_qos)

if ($null -ne $osConfig.disable_windows_animations) {
    Set-WindowsClientAreaAnimationSafe -Enabled (-not ([bool]$osConfig.disable_windows_animations))
}

Write-Host "`n=== Completed OS Performance Configuration: $Profile ===`n" -ForegroundColor Cyan
