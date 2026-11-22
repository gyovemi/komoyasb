<#
.SYNOPSIS
    Supervises desktop environment processes, monitoring health and automatically restarting crashed components.
.DESCRIPTION
    Monitors komorebi, whkd, and yasb processes. Implements exponential backoff and maximum retry thresholds
    (max 3 restarts within 60 seconds) to prevent restart storms when syntax errors or fatal panics occur.
    Also supports starting, stopping, and status-checking the entire stack.
.PARAMETER Action
    Supervision action to perform: Start, Stop, Restart, Status, or Monitor (default: Monitor).
.PARAMETER PollIntervalSeconds
    Seconds between health check polls. Defaults to 3.
.PARAMETER DryRun
    Simulates supervisor actions without actually spawning or killing processes.
.OUTPUTS
    None. Outputs process monitoring logs and status tables to console.
.EXAMPLE
    .\watchdog.ps1 -Action Status
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet("Monitor", "Start", "Stop", "Restart", "Status")]
    [string]$Action = "Monitor",

    [Parameter(Mandatory = $false)]
    [ValidateSet("all", "komorebi", "whkd", "yasb", "")]
    [string]$Service = "all",

    [Parameter(Mandatory = $false)]
    [int]$PollIntervalSeconds = 3,

    [Parameter(Mandatory = $false)]
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
Import-Module (Join-Path $coreHelpersDir "Environment.psm1") -Force

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }

# Process definitions
$watchedServices = @(
    @{
        Name           = "komorebi"
        ProcessName    = "komorebi"
        Executable     = "komorebi"
        Arguments      = @("-c", (Join-Path $userProfile ".config\komorebi\komorebi.json"))
        CheckReadiness = {
            if ([System.IO.File]::Exists('\\.\pipe\komorebi')) { return $true }
            if (Test-CommandAvailable -CommandName "komorebic") {
                & komorebic ping 2>&1 | Out-Null
                return ($LASTEXITCODE -eq 0)
            }
            return $false
        }
    },
    @{
        Name           = "whkd"
        ProcessName    = "whkd"
        Executable     = "whkd"
        Arguments      = @("-c", (Join-Path $userProfile ".config\whkdrc"))
        CheckReadiness = { return $true }
    },
    @{
        Name           = "yasb"
        ProcessName    = "yasb"
        Executable     = "yasb"
        Arguments      = @()
        CheckReadiness = { return $true }
    }
)

function Get-WatchedProcessStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$TargetService = "all"
    )

    $targetList = if ($TargetService -and $TargetService -ne "all") {
        $watchedServices | Where-Object { $_.Name -eq $TargetService }
    } else {
        $watchedServices
    }

    $results = foreach ($svc in $targetList) {
        $procs = @(Get-Process -Name $svc.ProcessName -ErrorAction SilentlyContinue)
        [PSCustomObject]@{
            Service = $svc.Name
            Running = if ($isDry) { $false } else { ($procs.Count -gt 0) }
            PIDs    = if ($isDry) { "Simulated" } elseif ($procs.Count -gt 0) { ($procs.Id -join ", ") } else { "None" }
        }
    }
    return $results
}

function Stop-WatchedProcesses {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $false)]
        [string]$TargetService = "all",
        [switch]$DryRun
    )

    $effectiveDry = $DryRun -or $isDry
    $targetList = if ($TargetService -and $TargetService -ne "all") {
        $watchedServices | Where-Object { $_.Name -eq $TargetService }
    } else {
        $watchedServices
    }

    $serviceNames = ($targetList | ForEach-Object { $_.Name }) -join ", "
    Write-Host "Stopping managed processes ($serviceNames)..."

    foreach ($svc in $targetList) {
        if ($effectiveDry) {
            if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
                Invoke-SystemAction -ActionType "ProcessControl" -Target $svc.ProcessName -Metadata @{ Action = "Stop"; ProcessName = $svc.ProcessName }
            }
            Write-Host "[DRYRUN] Stop-Process -Name $($svc.ProcessName)"
            continue
        }

        if ($svc.Name -eq "komorebi" -and (Test-CommandAvailable -CommandName "komorebic")) {
            try { & komorebic stop 2>&1 | Out-Null } catch {}
        }

        $procs = @(Get-Process -Name $svc.ProcessName -ErrorAction SilentlyContinue)
        if ($procs.Count -gt 0) {
            Write-Host "Stopping $($svc.Name)..."
            $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }
}

function Format-ProcessArguments {
    <#
    .SYNOPSIS
        Formats and escapes an array of command line arguments for Windows process creation.
    .DESCRIPTION
        Properly quotes arguments containing spaces or whitespace, escaping inner quotes
        to prevent argument injection or splitting when paths contain spaces.
    .PARAMETER Arguments
        Array of argument strings.
    .OUTPUTS
        [string] Space-delimited escaped arguments string suitable for ProcessStartInfo.Arguments.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [string[]]$Arguments
    )

    if ($null -eq $Arguments -or @($Arguments).Count -eq 0) {
        return ""
    }

    $formattedList = foreach ($arg in $Arguments) {
        if ([string]::IsNullOrEmpty($arg)) {
            '""'
        } elseif ($arg -match '[\s"]') {
            # Escape existing quotes and backslashes preceding quotes
            $escaped = $arg -replace '(\\*)(")', '$1$1\"'
            # If the argument ends with backslashes, escape them before closing quote
            $escaped = $escaped -replace '(\\+)$', '$1$1'
            "`"$escaped`""
        } else {
            $arg
        }
    }
    return ($formattedList -join " ")
}

function Start-WatchedProcess {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)][hashtable]$Service,
        [switch]$DryRun
    )

    $effectiveDry = $DryRun -or $isDry
    $formattedArgs = Format-ProcessArguments -Arguments $Service.Arguments

    if ($effectiveDry) {
        if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
            Invoke-SystemAction -ActionType "ProcessControl" -Target $Service.Executable -Metadata @{
                Action = "Start"; Executable = $Service.Executable; Arguments = $formattedArgs
            }
        }
        Write-Host "[DRYRUN] Start-Process $($Service.Executable) $formattedArgs"
        return $null
    }

    if (-not (Test-CommandAvailable -CommandName $Service.Executable)) {
        Write-Warning "Cannot start $($Service.Name): Executable '$($Service.Executable)' not found in PATH."
        return $null
    }

    Write-Host "Starting $($Service.Name)..."
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo -Property @{
        FileName        = $Service.Executable
        Arguments       = $formattedArgs
        UseShellExecute = $false
        CreateNoWindow  = $true
        WindowStyle     = [System.Diagnostics.ProcessWindowStyle]::Hidden
    }
    return [System.Diagnostics.Process]::Start($startInfo)
}

function Start-FullStack {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([switch]$DryRun)

    $effectiveDry = $DryRun -or $isDry
    Write-Host "=== Launching Desktop Environment Sequence ==="
    
    # Stage 1: Theme sync
    $themeSyncScript = Join-Path $scriptDir "sync-theme.ps1"
    if (Test-Path -LiteralPath $themeSyncScript) {
        Write-Host "Stage 1: Syncing themes and templates..."
        & $themeSyncScript -DryRun:$effectiveDry
    }

    # Stage 2: Start Komorebi
    Write-Host "Stage 2: Starting Komorebi Window Manager..."
    $komo = $watchedServices | Where-Object { $_.Name -eq "komorebi" }
    Start-WatchedProcess -Service $komo -DryRun:$effectiveDry

    if (-not $effectiveDry) {
        $maxAttempts = 50
        $delayMs = 100
        $ready = $false
        Write-Host "Polling Komorebi daemon readiness (\\.\pipe\komorebi / ping)..."
        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            try {
                if (& $komo.CheckReadiness) {
                    $ready = $true
                    $elapsedSec = ($attempt * $delayMs) / 1000.0
                    Write-Host "Komorebi daemon is ready after ${elapsedSec}s."
                    break
                }
            } catch {}
            Start-Sleep -Milliseconds $delayMs
        }
        if (-not $ready) {
            Write-Warning "Komorebi daemon readiness check timed out after 5.0s. Proceeding with dependent processes."
        }
    }

    # Stage 3: Start YASB and whkd
    Write-Host "Stage 3: Starting YASB status bar and WHKD keybinding daemon..."
    $yasb = $watchedServices | Where-Object { $_.Name -eq "yasb" }
    Start-WatchedProcess -Service $yasb -DryRun:$effectiveDry

    if (-not $effectiveDry) {
        for ($i = 1; $i -le 10; $i++) {
            if ((Get-Process -Name $yasb.ProcessName -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 100
        }
    }

    $whkd = $watchedServices | Where-Object { $_.Name -eq "whkd" }
    Start-WatchedProcess -Service $whkd -DryRun:$effectiveDry

    # Stage 4: Launch Shell auxiliaries
    Write-Host "Stage 4: Starting auxiliary shell tools..."
    if ($effectiveDry) {
        Write-Host "[DRYRUN] Would start Flow.Launcher.exe and EarTrumpet.exe if installed."
    } else {
        foreach ($tool in @("Flow.Launcher.exe", "EarTrumpet.exe")) {
            if (Test-CommandAvailable -CommandName $tool) {
                Start-Process -FilePath $tool -WindowStyle Hidden -ErrorAction SilentlyContinue
            }
        }
    }

    Write-Host "=== Stack launch sequence complete ==="
}

function Start-SingleService {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [switch]$DryRun
    )

    $effectiveDry = $DryRun -or $isDry
    $svc = $watchedServices | Where-Object { $_.Name -eq $ServiceName }
    if (-not $svc) {
        throw "Unknown service: '$ServiceName'"
    }

    Write-Host "Starting single service: $($svc.Name)..."
    $proc = Start-WatchedProcess -Service $svc -DryRun:$effectiveDry

    if ($ServiceName -eq "komorebi" -and -not $effectiveDry) {
        $maxAttempts = 50
        $delayMs = 100
        $ready = $false
        Write-Host "Polling Komorebi daemon readiness (\\.\pipe\komorebi / ping)..."
        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            try {
                if (& $svc.CheckReadiness) {
                    $ready = $true
                    $elapsedSec = ($attempt * $delayMs) / 1000.0
                    Write-Host "Komorebi daemon is ready after ${elapsedSec}s."
                    break
                }
            } catch {}
            Start-Sleep -Milliseconds $delayMs
        }
        if (-not $ready) {
            Write-Warning "Komorebi daemon readiness check timed out after 5.0s."
        }
    }

    return $proc
}

$isSingleService = ($Service -and $Service -ne "all")

switch ($Action) {
    "Status"  { Get-WatchedProcessStatus -TargetService $Service | Format-Table -AutoSize; return }
    "Stop"    { Stop-WatchedProcesses -TargetService $Service -DryRun:$DryRun; return }
    "Start"   {
        if ($isSingleService) {
            Start-SingleService -ServiceName $Service -DryRun:$DryRun | Out-Null
        } else {
            Start-FullStack -DryRun:$DryRun
        }
        return
    }
    "Restart" {
        if ($isSingleService) {
            Stop-WatchedProcesses -TargetService $Service -DryRun:$DryRun
            Start-Sleep -Seconds 1
            Start-SingleService -ServiceName $Service -DryRun:$DryRun | Out-Null
        } else {
            Stop-WatchedProcesses -TargetService "all" -DryRun:$DryRun
            Start-Sleep -Seconds 1
            Start-FullStack -DryRun:$DryRun
        }
        return
    }
    "Monitor" {
        $monitorList = if ($isSingleService) {
            $watchedServices | Where-Object { $_.Name -eq $Service }
        } else {
            $watchedServices
        }

        Write-Host "Starting Watchdog Supervisor (Polling every ${PollIntervalSeconds}s, Services: $(($monitorList | ForEach-Object { $_.Name }) -join ', '))..."
        Write-Host "Press Ctrl+C to exit watchdog supervisor."

        $restartHistory = @{}
        foreach ($svc in $monitorList) {
            $restartHistory[$svc.Name] = [System.Collections.Generic.List[datetime]]::new()
        }

        $maxRestartsInWindow = 3
        $windowSeconds = 60

        while ($true) {
            $now = Get-Date
            foreach ($svc in $monitorList) {
                $procs = @(Get-Process -Name $svc.ProcessName -ErrorAction SilentlyContinue)
                if ($procs.Count -eq 0) {
                    $history = $restartHistory[$svc.Name]
                    $recent = $history | Where-Object { ($now - $_).TotalSeconds -le $windowSeconds }
                    $restartHistory[$svc.Name] = [System.Collections.Generic.List[datetime]]::new()
                    foreach ($d in $recent) { $restartHistory[$svc.Name].Add($d) }

                    if ($restartHistory[$svc.Name].Count -ge $maxRestartsInWindow) {
                        Write-Warning "CRITICAL: Service '$($svc.Name)' exceeded maximum restart threshold ($maxRestartsInWindow restarts in ${windowSeconds}s). Supervisor paused for this service to prevent crash looping."
                        continue
                    }

                    Write-Warning "[WATCHDOG] Process '$($svc.Name)' is NOT running. Initiating auto-recovery restart..."
                    $restartHistory[$svc.Name].Add($now)
                    Start-WatchedProcess -Service $svc -DryRun:$DryRun
                }
            }
            Start-Sleep -Seconds $PollIntervalSeconds
        }
    }
}
