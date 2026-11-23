<#
.SYNOPSIS
    Unified entry point for sandboxed installation testing (Tier 1 Windows Sandbox & Tier 2 Local).
.DESCRIPTION
    Provides a zero-risk 1-command verification runner for the komoyasb desktop automation suite.
    - Tier 1 (Windows Sandbox VM): Generates dynamic .wsb configuration mounting the repository
      strictly read-only and an exchange folder writable in $env:TEMP. Launches WindowsSandbox.exe,
      executes guest automation, polls for completion, parses sandbox-report.json, and prints a summary.
    - Tier 2 (Local Isolated Profile): Lightweight fallback that executes install.ps1 and uninstall.ps1
      under DryRunContext inside an environment-variable and directory jail, ensuring zero host mutation.
    - Auto-detection: Checks for WindowsSandbox.exe. If present, runs Tier 1; if absent, gracefully
      falls back to Tier 2 with a host warning.
.PARAMETER Mode
    Sandbox execution mode: 'Auto', 'WSB', or 'Local'. Defaults to 'Auto'.
.PARAMETER NoAdmin
    Forces rootless execution mode without administrative privileges.
.PARAMETER TestUninstall
    Executes uninstallation rollback verification after installation.
.PARAMETER KeepLogs
    Retains the temporary exchange or jail directory after completion.
.PARAMETER TimeoutSeconds
    Maximum time to wait for Windows Sandbox VM completion. Defaults to 300 seconds.
.PARAMETER Theme
    Theme to compile and validate ('dark' or 'light'). Defaults to 'dark'.
.PARAMETER OutputDir
    Optional custom output directory for telemetry and reports.
.OUTPUTS
    Exit code 0 on PASS, 1 on FAIL. Displays console summary and optional JSON report.
.EXAMPLE
    .\scripts\Start-InstallSandbox.ps1
.EXAMPLE
    .\scripts\Start-InstallSandbox.ps1 -Mode WSB -TestUninstall
.EXAMPLE
    .\scripts\Start-InstallSandbox.ps1 -Mode Local -NoAdmin -KeepLogs
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("Auto", "WSB", "Local", IgnoreCase = $true)]
    [string]$Mode = "Auto",

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(Mandatory = $false)]
    [switch]$TestUninstall,

    [Parameter(Mandatory = $false)]
    [switch]$KeepLogs,

    [Parameter(Mandatory = $false)]
    [int]$TimeoutSeconds = 300,

    [Parameter(Mandatory = $false)]
    [string]$Theme = "dark",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# 1. Inspect Host Capabilities for Windows Sandbox
$wsbExePath = "C:\Windows\System32\WindowsSandbox.exe"
$hasWsb = (Test-Path -LiteralPath $wsbExePath) -or ($null -ne (Get-Command "WindowsSandbox.exe" -ErrorAction SilentlyContinue))

$effectiveMode = $Mode
if ($Mode -eq "Auto") {
    if ($hasWsb) {
        $effectiveMode = "WSB"
    } else {
        Write-Warning "Windows Sandbox (WindowsSandbox.exe) is not available on this host. Falling back to Tier 2 (Local Isolated Profile Sandbox)."
        $effectiveMode = "Local"
    }
} elseif ($Mode -eq "WSB") {
    if (-not $hasWsb) {
        throw "Windows Sandbox is not available on this host. To enable it on Windows 10/11 Pro or Enterprise, run 'Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All' in an elevated PowerShell session, or enable 'Windows Sandbox' under 'Turn Windows features on or off'. For Windows Home editions, use -Mode Local."
    }
    $effectiveMode = "WSB"
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  komoyasb Installation Sandbox Verification Runner            " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Mode:              $Mode (Resolved: $effectiveMode)" -ForegroundColor White
Write-Host "Repository Root:   $repoRoot" -ForegroundColor White
Write-Host "Rootless (NoAdmin):$($NoAdmin.IsPresent)" -ForegroundColor White
Write-Host "Test Uninstall:    $($TestUninstall.IsPresent)" -ForegroundColor White
Write-Host "Keep Logs:         $($KeepLogs.IsPresent)" -ForegroundColor White
Write-Host "Theme:             $Theme" -ForegroundColor White
Write-Host "================================================================`n" -ForegroundColor Cyan

# 2. Tier 2: Local Isolated Profile Sandbox
if ($effectiveMode -eq "Local") {
    if ($PSCmdlet.ShouldProcess("Tier 2 Local Sandbox", "Execute isolated profile installation test")) {
        $localSandboxScript = Join-Path $PSScriptRoot "sandbox\Invoke-LocalSandbox.ps1"
        if (-not (Test-Path -LiteralPath $localSandboxScript)) {
            throw "Tier 2 local sandbox script not found at '$localSandboxScript'."
        }

        Write-Host "Delegating execution to Tier 2 Local Isolated Profile Sandbox..." -ForegroundColor Cyan

        $localArgs = @{
            NoAdmin       = $NoAdmin
            TestUninstall = $TestUninstall
            KeepLogs      = $KeepLogs
            Theme         = $Theme
        }
        if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
            $localArgs['OutputDir'] = $OutputDir
        }

        & $localSandboxScript @localArgs
        if ($LASTEXITCODE) {
            exit $LASTEXITCODE
        } else {
            exit 0
        }
    }
    return
}

# 3. Tier 1: Windows Sandbox VM (.wsb)
$exchangeDir = if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $runId = (Get-Date).ToString("yyyyMMdd-HHmmss") + "-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
    Join-Path ([System.IO.Path]::GetTempPath()) ("komoyasb-sandbox-" + $runId)
} else {
    $OutputDir
}

if (-not (Test-Path -LiteralPath $exchangeDir)) {
    $null = New-Item -Path $exchangeDir -ItemType Directory -Force
}

$templatePath = Join-Path $PSScriptRoot "sandbox\template.wsb"
if (-not (Test-Path -LiteralPath $templatePath)) {
    throw "Windows Sandbox template XML not found at '$templatePath'."
}

$wsbTemplate = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8

$guestArgs = @(
    "-ExecutionPolicy Bypass",
    "-NoProfile",
    "-File C:\komoyasb-repo\scripts\sandbox\Invoke-SandboxInstall.ps1",
    "-RepoDir C:\komoyasb-repo",
    "-OutputDir C:\komoyasb-output",
    "-Theme $Theme"
)
if ($NoAdmin) {
    $guestArgs += "-NoAdmin"
}
if ($TestUninstall) {
    $guestArgs += "-TestUninstall"
}
$guestArgString = $guestArgs -join " "

$guestCommand = "powershell.exe $guestArgString"

$escapedCommand = [System.Security.SecurityElement]::Escape($guestCommand)
$wsbContent = $wsbTemplate.Replace("__REPO_DIR__", $repoRoot).Replace("__LOG_DIR__", $exchangeDir).Replace("__COMMAND__", $escapedCommand)

$wsbFile = Join-Path $exchangeDir "sandbox.wsb"
Set-Content -LiteralPath $wsbFile -Value $wsbContent -Encoding UTF8
Write-Host "Generated Windows Sandbox configuration at: $wsbFile" -ForegroundColor Green

$tokenFile = Join-Path $exchangeDir "completed.token"
$reportFile = Join-Path $exchangeDir "sandbox-report.json"
$logFile = Join-Path $exchangeDir "sandbox-install.log"
$exitCode = 0

try {
    if ($PSCmdlet.ShouldProcess("WindowsSandbox", "Launch Windows Sandbox with $wsbFile")) {
        if (-not $WhatIfPreference -and -not ($PSBoundParameters['WhatIf'])) {
            $sandboxExe = if (Test-Path -LiteralPath $wsbExePath) { $wsbExePath } else { "WindowsSandbox.exe" }
            Write-Host "Launching Windows Sandbox VM: $sandboxExe `"$wsbFile`"" -ForegroundColor Cyan
            $sandboxProcess = Start-Process -FilePath $sandboxExe -ArgumentList "`"$wsbFile`"" -PassThru

            Write-Host "Waiting for Windows Sandbox to complete execution (Timeout: ${TimeoutSeconds}s)..." -ForegroundColor Cyan
            $pollIntervalSeconds = 2
            $elapsedSeconds = 0
            $completed = $false

            while ($elapsedSeconds -lt $TimeoutSeconds) {
                Start-Sleep -Seconds $pollIntervalSeconds
                $elapsedSeconds += $pollIntervalSeconds

                if (Test-Path -LiteralPath $tokenFile) {
                    $completed = $true
                    Write-Host "Execution completion token detected after ${elapsedSeconds} seconds." -ForegroundColor Green
                    break
                }

                if ($elapsedSeconds % 10 -eq 0) {
                    Write-Host "  Sandbox execution in progress... (${elapsedSeconds}s / ${TimeoutSeconds}s)" -ForegroundColor Gray
                }
            }

            if (-not $completed) {
                Write-Error "Windows Sandbox execution timed out after ${TimeoutSeconds} seconds without creating completed.token."
                $exitCode = 1
            }

            if (Test-Path -LiteralPath $reportFile) {
                try {
                    $reportRaw = Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8
                    $reportObj = ConvertFrom-Json -InputObject $reportRaw

                    Write-Host "`n================================================================" -ForegroundColor Cyan
                    Write-Host "         Windows Sandbox VM Execution Telemetry Summary         " -ForegroundColor Cyan
                    Write-Host "================================================================" -ForegroundColor Cyan
                    Write-Host "Status:        $($reportObj.status)" -ForegroundColor (if ($reportObj.status -eq "PASS") { "Green" } else { "Red" })
                    Write-Host "Tier:          $($reportObj.tier)" -ForegroundColor White
                    Write-Host "Mode:          $($reportObj.mode)" -ForegroundColor White
                    Write-Host "Duration:      $($reportObj.durationMs) ms" -ForegroundColor White
                    Write-Host "Configs Valid: $($reportObj.verification.configsValid)" -ForegroundColor White
                    Write-Host "Theme Compiled:$($reportObj.verification.themesCompiled)" -ForegroundColor White

                    if ($reportObj.uninstallation -and $reportObj.uninstallation.executed) {
                        Write-Host "Configs Restored: $($reportObj.uninstallation.configsRestored)" -ForegroundColor White
                        Write-Host "Processes Stopped:$($reportObj.uninstallation.processesStopped)" -ForegroundColor White
                    }

                    if ($reportObj.errors -and @($reportObj.errors).Count -gt 0) {
                        Write-Host "`nErrors Reported:" -ForegroundColor Red
                        foreach ($err in $reportObj.errors) {
                            Write-Host "  - $err" -ForegroundColor Red
                        }
                    }
                    Write-Host "================================================================`n" -ForegroundColor Cyan

                    $exitCode = if ($reportObj.status -eq "PASS") { 0 } else { 1 }
                } catch {
                    Write-Error "Failed to parse sandbox-report.json: $_"
                    $exitCode = 1
                }
            } else {
                Write-Warning "sandbox-report.json was not found in exchange directory: $exchangeDir"
                $exitCode = 1
            }
        }
    }
} finally {
    if (-not $KeepLogs -and (Test-Path -LiteralPath $exchangeDir)) {
        try {
            Remove-Item -LiteralPath $exchangeDir -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Warning "Could not purge temporary exchange directory '${exchangeDir}': $_"
        }
    } elseif ($KeepLogs) {
        Write-Host "Exchange directory preserved at: $exchangeDir" -ForegroundColor Yellow
    }
}

if ($exitCode -ne 0) {
    exit $exitCode
}
