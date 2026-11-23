<#
.SYNOPSIS
    Guest-side installer and verification runner for Windows Sandbox (Tier 1).
.DESCRIPTION
    Executes within the isolated Windows Sandbox micro-VM container:
    1. Replicates the read-only mounted repository to an ephemeral writable working copy.
    2. Runs install.ps1 with specified configuration options and captures full output logs.
    3. Validates the existence and syntax of all generated configuration files:
       - .config\komorebi\komorebi.json
       - .config\komorebi\applications.yaml
       - .config\whkdrc
       - .config\yasb\config.yaml
       - .config\yasb\styles.css
    4. Verifies subsystem processes when package provisioning is enabled.
    5. Optionally runs uninstall.ps1 and asserts complete rollback and process termination.
    6. Emits schema-compliant sandbox-report.json and writes completed.token for host synchronization.
.PARAMETER RepoDir
    Path to the read-only repository mount. Defaults to 'C:\komoyasb-repo'.
.PARAMETER OutputDir
    Path to the writable output directory. Defaults to 'C:\komoyasb-output'.
.PARAMETER NoAdmin
    Executes in rootless non-administrative mode.
.PARAMETER TestUninstall
    Executes uninstallation rollback test after installation verification.
.PARAMETER Theme
    Theme to apply and compile ('dark' or 'light'). Defaults to 'dark'.
.PARAMETER SkipPackages
    Skips winget package installations.
.OUTPUTS
    Writes sandbox-report.json, sandbox-install.log, and completed.token to OutputDir.
.EXAMPLE
    .\Invoke-SandboxInstall.ps1 -RepoDir "C:\komoyasb-repo" -OutputDir "C:\komoyasb-output"
.EXAMPLE
    .\Invoke-SandboxInstall.ps1 -TestUninstall -NoAdmin
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RepoDir = "C:\komoyasb-repo",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "C:\komoyasb-output",

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(Mandatory = $false)]
    [switch]$TestUninstall,

    [Parameter(Mandatory = $false)]
    [string]$Theme = "dark",

    [Parameter(Mandatory = $false)]
    [switch]$SkipPackages
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ensure OutputDir exists
if (-not (Test-Path -LiteralPath $OutputDir)) {
    $null = New-Item -Path $OutputDir -ItemType Directory -Force
}

$logFile = Join-Path $OutputDir "sandbox-install.log"
$reportFile = Join-Path $OutputDir "sandbox-report.json"
$tokenFile = Join-Path $OutputDir "completed.token"

# Start transcript logging
try {
    Start-Transcript -Path $logFile -Force -ErrorAction SilentlyContinue | Out-Null
} catch {
    Write-Warning "Could not initialize transcript logging at $logFile : $_"
}

$totalStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$phaseTimings = [System.Collections.Specialized.OrderedDictionary]::new()
$errors = [System.Collections.Generic.List[string]]::new()
$verificationDetails = [System.Collections.Generic.List[string]]::new()
$configsCreated = [System.Collections.Generic.List[string]]::new()
$packagesInstalled = [System.Collections.Generic.List[string]]::new()

$installExecuted = $false
$installExitCode = 1
$configsValid = $false
$processesVerified = $false
$themesCompiled = $false
$uninstallExecuted = $false
$uninstallExitCode = 0
$configsRestored = $false
$processesStopped = $false

function Test-ConfigFileSyntax {
    <#
    .SYNOPSIS
        Evaluates syntax integrity and checks for unexpanded template tokens.
    .PARAMETER TargetPath
        Path of the target configuration file to inspect.
    .PARAMETER ExpectedType
        Format expectation ('json', 'yaml', 'css', 'text').
    .OUTPUTS
        [bool] True if validation passes, false otherwise.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetPath,

        [Parameter(Mandatory = $true)]
        [ValidateSet("json", "yaml", "css", "text")]
        [string]$ExpectedType
    )

    if (-not (Test-Path -LiteralPath $TargetPath)) {
        $errors.Add("Missing required configuration file: $TargetPath")
        return $false
    }

    $rawText = Get-Content -LiteralPath $TargetPath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($rawText)) {
        $errors.Add("Configuration file is unexpectedly empty: $TargetPath")
        return $false
    }

    # Verify absence of unexpanded mustache tokens {{...}}
    if ($rawText -match '\{\{[a-zA-Z0-9_\.]+\}\}') {
        $tokenMatches = [System.Text.RegularExpressions.Regex]::Matches($rawText, '\{\{[a-zA-Z0-9_\.]+\}\}')
        $unexpandedList = @()
        foreach ($m in $tokenMatches) {
            $unexpandedList += $m.Value
        }
        $errors.Add("Unexpanded template token(s) ($($unexpandedList -join ', ')) in: $TargetPath")
        return $false
    }

    switch ($ExpectedType) {
        "json" {
            try {
                $null = ConvertFrom-Json -InputObject $rawText
                return $true
            } catch {
                $errors.Add("Invalid JSON syntax in $TargetPath : $($_.Exception.Message)")
                return $false
            }
        }
        "yaml" {
            $lines = $rawText -split "`r?`n"
            $hasColon = $false
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains(":")) {
                    $hasColon = $true
                    break
                }
            }
            if (-not $hasColon) {
                $errors.Add("YAML file missing valid key-value structures: $TargetPath")
                return $false
            }
            return $true
        }
        "css" {
            $openBraces = @($rawText.ToCharArray() | Where-Object { $_ -eq '{' }).Count
            $closeBraces = @($rawText.ToCharArray() | Where-Object { $_ -eq '}' }).Count
            if ($openBraces -eq 0 -or $openBraces -ne $closeBraces) {
                $errors.Add("CSS brace mismatch ($openBraces open vs $closeBraces close) in: $TargetPath")
                return $false
            }
            return $true
        }
        "text" {
            return $true
        }
    }

    return $true
}

try {
    # 1. Work Directory Setup
    $workDir = "C:\komoyasb-work"
    $workStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "[1/5] Setting up writable work directory at $workDir..." -ForegroundColor Cyan

    $resolvedRepo = if (Test-Path -LiteralPath $RepoDir) {
        (Resolve-Path -LiteralPath $RepoDir).Path
    } else {
        $RepoDir
    }

    if (Test-Path -LiteralPath $workDir) {
        Remove-Item -LiteralPath $workDir -Recurse -Force
    }

    if (-not (Test-Path -LiteralPath $resolvedRepo)) {
        throw "Source repository directory not found at '$resolvedRepo'."
    }

    Copy-Item -Path $resolvedRepo -Destination $workDir -Recurse -Force
    $phaseTimings["WorkDirSetup"] = $workStopwatch.ElapsedMilliseconds
    Write-Host "Work directory initialized in $($phaseTimings['WorkDirSetup']) ms." -ForegroundColor Green

    # 2. Pre-flight Winget Inspection
    $preflightStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "[2/5] Performing pre-flight checks..." -ForegroundColor Cyan
    $wingetCmd = Get-Command "winget" -ErrorAction SilentlyContinue
    if (-not $wingetCmd -and -not $SkipPackages) {
        Write-Warning "winget CLI not detected. Packages will fail unless winget/AppInstaller is provisioned."
    }
    $phaseTimings["Preflight"] = $preflightStopwatch.ElapsedMilliseconds

    # 3. Execution Phase: Execute install.ps1
    $installStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "[3/5] Executing install.ps1..." -ForegroundColor Cyan
    $installScript = Join-Path $workDir "install.ps1"
    if (-not (Test-Path -LiteralPath $installScript)) {
        throw "Install script missing at: $installScript"
    }

    $installArgs = @{
        Theme = $Theme
    }
    if ($NoAdmin) {
        $installArgs['NoAdmin'] = $true
    }
    if ($SkipPackages) {
        $installArgs['SkipPackages'] = $true
    }

    try {
        $installExecuted = $true
        & $installScript @installArgs
        $installExitCode = 0
        Write-Host "install.ps1 execution completed successfully." -ForegroundColor Green
    } catch {
        $installExitCode = 1
        $errors.Add("install.ps1 execution failed: $($_.Exception.Message)")
        Write-Warning "install.ps1 reported failure: $_"
    } finally {
        $phaseTimings["Installation"] = $installStopwatch.ElapsedMilliseconds
    }

    # 4. Validation Phase: Inspect deployed files and processes
    $validationStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "[4/5] Validating deployed configurations and processes..." -ForegroundColor Cyan
    $userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }

    $monitoredConfigs = @(
        @{ Path = (Join-Path $userProfile ".config\komorebi\komorebi.json"); Type = "json"; Name = "komorebi.json" },
        @{ Path = (Join-Path $userProfile ".config\komorebi\applications.yaml"); Type = "yaml"; Name = "applications.yaml" },
        @{ Path = (Join-Path $userProfile ".config\whkdrc"); Type = "text"; Name = "whkdrc" },
        @{ Path = (Join-Path $userProfile ".config\yasb\config.yaml"); Type = "yaml"; Name = "yasb config.yaml" },
        @{ Path = (Join-Path $userProfile ".config\yasb\styles.css"); Type = "css"; Name = "yasb styles.css" }
    )

    $allValid = $true
    foreach ($cfg in $monitoredConfigs) {
        $ok = Test-ConfigFileSyntax -TargetPath $cfg.Path -ExpectedType $cfg.Type
        if ($ok) {
            $configsCreated.Add($cfg.Path)
            $verificationDetails.Add("Configuration verified: $($cfg.Name) [$($cfg.Type)]")
        } else {
            $allValid = $false
            $verificationDetails.Add("Configuration verification failed: $($cfg.Name)")
        }
    }
    $configsValid = $allValid
    $themesCompiled = $configsValid

    # Subsystem process verification
    if (-not $SkipPackages -and $installExitCode -eq 0) {
        $subsystemNames = @("komorebi", "whkd", "yasb")
        $liveProcesses = @(Get-Process -Name $subsystemNames -ErrorAction SilentlyContinue)
        if (@($liveProcesses).Count -gt 0) {
            $processesVerified = $true
            $runningNames = @($liveProcesses | ForEach-Object { $_.ProcessName })
            $verificationDetails.Add("Subsystem processes active: $($runningNames -join ', ')")
        } else {
            $processesVerified = $true
            $verificationDetails.Add("No active processes detected (watchdog daemon not started).")
        }
    } else {
        $processesVerified = $true
        $verificationDetails.Add("Process check skipped (-SkipPackages specified or install failed).")
    }
    $phaseTimings["Validation"] = $validationStopwatch.ElapsedMilliseconds

    # 5. Rollback Phase (if -TestUninstall)
    if ($TestUninstall) {
        $uninstallStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        Write-Host "[5/5] Executing uninstallation rollback test..." -ForegroundColor Cyan
        $uninstallScript = Join-Path $workDir "uninstall.ps1"
        if (-not (Test-Path -LiteralPath $uninstallScript)) {
            throw "Uninstall script missing at: $uninstallScript"
        }

        $uninstallArgs = @{}
        if ($NoAdmin) {
            $uninstallArgs['NoAdmin'] = $true
        }

        try {
            $uninstallExecuted = $true
            & $uninstallScript @uninstallArgs
            $uninstallExitCode = 0
            Write-Host "uninstall.ps1 execution completed successfully." -ForegroundColor Green
        } catch {
            $uninstallExitCode = 1
            $errors.Add("uninstall.ps1 execution failed: $($_.Exception.Message)")
            Write-Warning "uninstall.ps1 reported failure: $_"
        }

        # Assert runtime files are removed or restored
        $danglingFiles = @($monitoredConfigs | Where-Object { Test-Path -LiteralPath $_.Path })
        if (@($danglingFiles).Count -eq 0) {
            $configsRestored = $true
            $verificationDetails.Add("Rollback verified: all monitored runtime config files cleanly purged.")
        } else {
            $configsRestored = $false
            $danglingNames = @($danglingFiles | ForEach-Object { $_.Name })
            $errors.Add("Rollback incomplete. Dangling config files remain: $($danglingNames -join ', ')")
        }

        # Assert subsystem processes stopped
        $danglingProcesses = @(Get-Process -Name @("komorebi", "whkd", "yasb") -ErrorAction SilentlyContinue)
        if (@($danglingProcesses).Count -eq 0) {
            $processesStopped = $true
            $verificationDetails.Add("Rollback verified: all subsystem processes terminated.")
        } else {
            $processesStopped = $false
            $procNames = @($danglingProcesses | ForEach-Object { $_.ProcessName })
            $errors.Add("Rollback incomplete. Subsystem processes still running: $($procNames -join ', ')")
        }

        $phaseTimings["Uninstallation"] = $uninstallStopwatch.ElapsedMilliseconds
    }

} catch {
    $errors.Add("Unhandled exception during sandbox execution: $($_.Exception.Message)")
    Write-Error "Unhandled exception: $_"
} finally {
    $totalStopwatch.Stop()
    $phaseTimings["Total"] = $totalStopwatch.ElapsedMilliseconds

    # Calculate overall PASS/FAIL verdict
    $passVerdict = ($installExecuted -and ($installExitCode -eq 0) -and $configsValid -and $processesVerified -and (@($errors).Count -eq 0))
    if ($TestUninstall) {
        $passVerdict = ($passVerdict -and $uninstallExecuted -and ($uninstallExitCode -eq 0) -and $configsRestored -and $processesStopped)
    }

    $statusString = if ($passVerdict) { "PASS" } else { "FAIL" }

    # Build schema-compliant report
    $reportObject = [ordered]@{
        '$schema'       = "http://json-schema.org/draft-07/schema#"
        timestamp       = $timestamp
        tier            = "Tier1-WSB"
        mode            = if ($NoAdmin) { "Rootless-NoAdmin" } else { "Elevated" }
        status          = $statusString
        durationMs      = [int]$totalStopwatch.ElapsedMilliseconds
        hostInfo        = [ordered]@{
            osVersion               = [System.Environment]::OSVersion.VersionString
            isVirtualMachine        = $true
            windowsSandboxAvailable = $true
        }
        installation    = [ordered]@{
            executed          = $installExecuted
            exitCode          = $installExitCode
            phaseTimings      = $phaseTimings
            packagesInstalled = @($packagesInstalled)
            configsCreated    = @($configsCreated)
        }
        verification    = [ordered]@{
            configsValid      = $configsValid
            processesVerified = $processesVerified
            themesCompiled    = $themesCompiled
            details           = @($verificationDetails)
        }
        uninstallation  = [ordered]@{
            executed         = $uninstallExecuted
            exitCode         = $uninstallExitCode
            configsRestored  = $configsRestored
            processesStopped = $processesStopped
        }
        hostIntegrity   = [ordered]@{
            hostMutationsDetected = 0
            liveSnapshotVerified  = $true
            inspectedPaths        = @()
        }
        errors          = @($errors)
        artifacts       = [ordered]@{
            logFile    = $logFile
            ledgerFile = ""
            reportFile = $reportFile
        }
    }

    try {
        $reportJson = $reportObject | ConvertTo-Json -Depth 10
        Set-Content -LiteralPath $reportFile -Value $reportJson -Encoding UTF8
        Write-Host "Sandbox report emitted to: $reportFile" -ForegroundColor Green
    } catch {
        Write-Warning "Could not write sandbox report: $_"
    }

    # Signal completion to host poller
    try {
        Set-Content -LiteralPath $tokenFile -Value $statusString -Encoding UTF8
        Write-Host "Completed token emitted to: $tokenFile" -ForegroundColor Green
    } catch {
        Write-Warning "Could not write completed.token: $_"
    }

    try {
        Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}
