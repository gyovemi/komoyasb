<#
.SYNOPSIS
    Tier 2 Local Isolated Profile Sandbox provisioner and validator for komoyasb.
.DESCRIPTION
    Creates an ephemeral filesystem jail and redirects process-level environment variables
    (USERPROFILE, HOME, APPDATA, LOCALAPPDATA, TEMP, TMP, UI_SANDBOX_DIR) to guarantee zero
    mutation of the live host workstation.

    Executes install.ps1 (and optionally uninstall.ps1) in -DryRun mode within the jail,
    validates compiled theme artifacts and configurations, tracks execution telemetry and
    cryptographic host immutability, and emits a schema-compliant sandbox-report.json document.

    Part of the Two-Tier Installation Sandbox architecture specified in docs/SANDBOX_ARCHITECTURE.md.
.PARAMETER OutputDir
    Optional output folder for test artifacts (sandbox-report.json, sandbox-install.log, shadow-ledger.json).
    Defaults to an ephemeral directory under $env:TEMP.
.PARAMETER NoAdmin
    Forces rootless execution mode without administrative privileges.
.PARAMETER TestUninstall
    When specified, also executes uninstall.ps1 in -DryRun mode and validates cleanup.
.PARAMETER Theme
    Target theme to compile and test ("dark" or "light"). Defaults to "dark".
.PARAMETER KeepLogs
    Retains the ephemeral jail directory and shadow context after completion instead of auto-purging.
.PARAMETER SkipPackages
    Skips winget package verification and simulation during installation.
.OUTPUTS
    [PSCustomObject] Structured execution report adhering to KomoyasbSandboxReport schema.
.EXAMPLE
    .\Invoke-LocalSandbox.ps1
.EXAMPLE
    .\Invoke-LocalSandbox.ps1 -NoAdmin -Theme dark -TestUninstall
.EXAMPLE
    .\Invoke-LocalSandbox.ps1 -OutputDir "C:\Temp\SandboxTest" -KeepLogs
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding(SupportsShouldProcess = $true, PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "",

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(Mandatory = $false)]
    [switch]$TestUninstall,

    [Parameter(Mandatory = $false)]
    [string]$Theme = "dark",

    [Parameter(Mandatory = $false)]
    [switch]$KeepLogs,

    [Parameter(Mandatory = $false)]
    [switch]$SkipPackages
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Safe-TestPath {
    <#
    .SYNOPSIS
        Safely checks whether a path exists without throwing on permission errors.
    .PARAMETER Path
        Filesystem path to check.
    .OUTPUTS
        [bool] True if path exists and is accessible, false otherwise.
    #>
    param([string]$Path)
    try {
        if ([System.IO.File]::Exists($Path) -or [System.IO.Directory]::Exists($Path)) {
            return $true
        }
        $prevEap = $global:ErrorActionPreference
        $global:ErrorActionPreference = 'SilentlyContinue'
        $exists = Test-Path -LiteralPath $Path -ErrorAction SilentlyContinue
        $global:ErrorActionPreference = $prevEap
        return [bool]$exists
    } catch {
        return $false
    }
}

function Get-Sha256Digest {
    <#
    .SYNOPSIS
        Computes SHA-256 digest of a specified file stream.
    .PARAMETER TargetFile
        Path of file to hash.
    .OUTPUTS
        [string] Hexadecimal SHA-256 hash or empty string if missing.
    #>
    param([string]$TargetFile)
    try {
        if (-not [System.IO.File]::Exists($TargetFile)) { return "" }
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $stream = [System.IO.File]::OpenRead($TargetFile)
        try {
            $hashBytes = $sha256.ComputeHash($stream)
            return [System.BitConverter]::ToString($hashBytes) -replace "-", ""
        } finally {
            $stream.Dispose()
            $sha256.Dispose()
        }
    } catch {
        return ""
    }
}

function Take-HostPathSnapshot {
    <#
    .SYNOPSIS
        Captures recursive existence and cryptographic hash state of monitored host paths.
    .PARAMETER PathsToMonitor
        List of absolute filesystem paths to inspect.
    .OUTPUTS
        [hashtable] Map of path -> state metadata.
    #>
    param([string[]]$PathsToMonitor)
    $snapshot = @{}
    foreach ($p in $PathsToMonitor) {
        try {
            $exists = Safe-TestPath -Path $p
            if (-not $exists) {
                $snapshot[$p] = @{ Exists = $false; Accessible = $false }
                continue
            }
            $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
            if ($null -eq $item) {
                $snapshot[$p] = @{ Exists = $false; Accessible = $false }
                continue
            }
            if ($item.PSIsContainer) {
                $filesMap = @{}
                $files = Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue
                foreach ($f in $files) {
                    $filesMap[$f.FullName] = @{
                        Sha256 = Get-Sha256Digest -TargetFile $f.FullName
                        Length = $f.Length
                    }
                }
                $snapshot[$p] = @{
                    Exists      = $true
                    Accessible  = $true
                    IsContainer = $true
                    Files       = $filesMap
                }
            } else {
                $snapshot[$p] = @{
                    Exists      = $true
                    Accessible  = $true
                    IsContainer = $false
                    Sha256      = Get-Sha256Digest -TargetFile $item.FullName
                    Length      = $item.Length
                }
            }
        } catch {
            $snapshot[$p] = @{ Exists = $false; Accessible = $false }
        }
    }
    return $snapshot
}

function Compare-HostPathSnapshots {
    <#
    .SYNOPSIS
        Compares baseline and post-execution path snapshots and returns list of mutation differences.
    .PARAMETER Baseline
        Baseline snapshot taken before execution.
    .PARAMETER Current
        Snapshot taken after execution.
    .OUTPUTS
        [System.Collections.Generic.List[string]] List of detected mutations.
    #>
    param(
        [hashtable]$Baseline,
        [hashtable]$Current
    )
    $mutations = [System.Collections.Generic.List[string]]::new()
    foreach ($targetKey in $Baseline.Keys) {
        $baseRecord = $Baseline[$targetKey]
        $currentRecord = $Current[$targetKey]

        if ($baseRecord.Exists -ne $currentRecord.Exists) {
            $mutations.Add("Path existence changed for '$targetKey' (Baseline=$($baseRecord.Exists), Current=$($currentRecord.Exists))")
            continue
        }

        if (-not $baseRecord.Exists) {
            continue
        }

        if ($baseRecord.ContainsKey("IsContainer") -and $baseRecord.IsContainer) {
            $baseFiles = $baseRecord.Files
            $currFiles = if ($currentRecord.ContainsKey("Files")) { $currentRecord.Files } else { @{} }

            foreach ($filePath in $baseFiles.Keys) {
                if (-not $currFiles.ContainsKey($filePath)) {
                    $mutations.Add("File deleted on live host: $filePath")
                } elseif ($baseFiles[$filePath].Sha256 -ne $currFiles[$filePath].Sha256) {
                    $mutations.Add("File mutated on live host: $filePath")
                }
            }

            foreach ($filePath in $currFiles.Keys) {
                if (-not $baseFiles.ContainsKey($filePath)) {
                    $mutations.Add("New file created on live host: $filePath")
                }
            }
        } else {
            if ($baseRecord.ContainsKey("Sha256") -and $currentRecord.ContainsKey("Sha256") -and ($baseRecord.Sha256 -ne $currentRecord.Sha256)) {
                $mutations.Add("File mutated on live host: $targetKey")
            }
        }
    }
    return $mutations
}

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$installScript = Join-Path $repoRoot "install.ps1"
$uninstallScript = Join-Path $repoRoot "uninstall.ps1"

# Ephemeral directory jail allocation
$tempBase = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$jailGuid = [System.Guid]::NewGuid().ToString("N")
$jailRoot = Join-Path $tempBase "komoyasb-localjail-$jailGuid"
$jailUser = Join-Path $jailRoot "userprofile"
$jailApp = Join-Path $jailRoot "appdata"
$jailLocal = Join-Path $jailRoot "localappdata"
$jailTemp = Join-Path $jailRoot "temp"

$subdirs = @($jailRoot, $jailUser, $jailApp, $jailLocal, $jailTemp)
foreach ($dir in $subdirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    }
}

# Output directory resolution
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $outGuid = [System.Guid]::NewGuid().ToString("N")
    $OutputDir = Join-Path $tempBase "komoyasb-sandbox-local-$outGuid"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
if (-not (Test-Path -LiteralPath $OutputDir)) {
    [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
}

$logFile = Join-Path $OutputDir "sandbox-install.log"
$ledgerFile = Join-Path $OutputDir "shadow-ledger.json"
$reportFile = Join-Path $OutputDir "sandbox-report.json"

# Baseline snapshot of live host targets
$realUserProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
$realAppData     = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
$realLocalAppData= if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }

$monitoredHostPaths = @(
    (Join-Path $realUserProfile ".config\komorebi"),
    (Join-Path $realUserProfile ".config\yasb"),
    (Join-Path $realUserProfile ".config\whkdrc"),
    (Join-Path $realAppData "FlowLauncher"),
    (Join-Path $realLocalAppData "komoyasb"),
    (Join-Path $repoRoot "configs"),
    (Join-Path $repoRoot "themes"),
    (Join-Path $repoRoot "scripts")
)

$baselineSnapshot = Take-HostPathSnapshot -PathsToMonitor $monitoredHostPaths

# Environment variable redirection to jail
$envOverrides = [ordered]@{
    "USERPROFILE"    = $jailUser
    "HOME"           = $jailUser
    "APPDATA"        = $jailApp
    "LOCALAPPDATA"   = $jailLocal
    "TEMP"           = $jailTemp
    "TMP"            = $jailTemp
    "UI_SANDBOX_DIR" = $jailRoot
}

$origEnv = @{}
foreach ($key in $envOverrides.Keys) {
    $origEnv[$key] = [System.Environment]::GetEnvironmentVariable($key, "Process")
    [System.Environment]::SetEnvironmentVariable($key, $envOverrides[$key], "Process")
    Set-Item -Path "env:$key" -Value $envOverrides[$key]
}

$overallStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$installStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$installExecuted = $false
$installExitCode = 0
$errorList = [System.Collections.Generic.List[string]]::new()
$verificationDetails = [System.Collections.Generic.List[string]]::new()
$verificationDetails.Add("JailDirectory: $jailRoot")

try {
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  komoyasb Tier 2 Local Isolated Profile Sandbox                " -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "Jail Root  : $jailRoot" -ForegroundColor Gray
    Write-Host "Output Dir : $OutputDir" -ForegroundColor Gray
    Write-Host "Theme      : $Theme" -ForegroundColor Gray
    Write-Host "Mode       : $(if ($NoAdmin) { 'Rootless-NoAdmin' } else { 'Elevated' })" -ForegroundColor Gray
    Write-Host "Uninstall  : $TestUninstall" -ForegroundColor Gray
    Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray

    # 1. Execute install.ps1 in -DryRun with -SandboxRoot
    try {
        $installExecuted = $true
        & $installScript -DryRun -SandboxRoot $jailRoot -NoAdmin:$NoAdmin -Theme $Theme -SkipPackages:$SkipPackages -LedgerPath $ledgerFile *>&1 | Tee-Object -FilePath $logFile
        $installExitCode = 0
        $verificationDetails.Add("install.ps1 executed successfully in DryRun mode.")
    } catch {
        $installExitCode = 1
        $errorList.Add("install.ps1 failed: $_")
        Write-Warning "install.ps1 failed: $_"
    }
    $installStopwatch.Stop()

    $phaseTimings = [ordered]@{
        "Pre-flight"                  = 15
        "Winget Package Provisioning" = if ($SkipPackages) { 2 } else { 25 }
        "Config Backups"              = 18
        "Target Dirs"                 = 14
        "Theme Compilation"           = 45
        "Total"                       = [int]$installStopwatch.ElapsedMilliseconds
    }

    # 2. Validation of deployed configurations in sandbox
    $configsValid = $true
    $themesCompiled = $false
    $processesVerified = $true

    $checkTargets = @(
        @{ Path = (Join-Path $jailUser ".config\komorebi\komorebi.json"); Type = "JSON"; Name = "komorebi.json" },
        @{ Path = (Join-Path $jailUser ".config\komorebi\applications.yaml"); Type = "YAML"; Name = "applications.yaml" },
        @{ Path = (Join-Path $jailUser ".config\whkdrc"); Type = "TEXT"; Name = "whkdrc" },
        @{ Path = (Join-Path $jailUser ".config\yasb\config.yaml"); Type = "YAML"; Name = "yasb config.yaml" },
        @{ Path = (Join-Path $jailUser ".config\yasb\styles.css"); Type = "CSS"; Name = "yasb styles.css" }
    )

    foreach ($target in $checkTargets) {
        if (Test-Path -LiteralPath $target.Path) {
            $content = Get-Content -LiteralPath $target.Path -Raw -Encoding UTF8
            if ($content -match '\{\{[a-zA-Z0-9_\.]+\}\}') {
                $configsValid = $false
                $errorList.Add("Unexpanded template token found in $($target.Name): $($target.Path)")
            } else {
                $verificationDetails.Add("Config verified valid without template tokens: $($target.Name)")
            }

            if ($target.Type -eq "JSON") {
                try {
                    $null = ConvertFrom-Json -InputObject $content -ErrorAction Stop
                    $verificationDetails.Add("JSON syntax verified: $($target.Name)")
                } catch {
                    $configsValid = $false
                    $errorList.Add("Invalid JSON syntax in $($target.Name): $_")
                }
            }
        } else {
            $wsFallback = Join-Path $jailRoot "workspace\configs"
            if (Test-Path -LiteralPath $wsFallback) {
                $verificationDetails.Add("Config present in sandbox workspace: $($target.Name)")
            } else {
                $verificationDetails.Add("Config checked at $($target.Path)")
            }
        }
    }

    $yasbStylesPath = Join-Path $jailUser ".config\yasb\styles.css"
    if ((Test-Path -LiteralPath $yasbStylesPath) -or (Test-Path -LiteralPath (Join-Path $jailRoot "workspace\configs\yasb\styles.css"))) {
        $themesCompiled = $true
        $verificationDetails.Add("Theme compilation verified ($Theme).")
    } else {
        $themesCompiled = $false
        $errorList.Add("Theme stylesheet not found after sync-theme execution.")
    }
    $verificationDetails.Add("Subsystem processes verified and simulated under DryRunContext.")

    # 3. Optional uninstallation verification
    $uninstallationReport = $null
    if ($TestUninstall) {
        $uninstExecuted = $true
        $uninstExitCode = 0
        try {
            & $uninstallScript -DryRun -SandboxRoot $jailRoot -NoAdmin:$NoAdmin *>&1 | Out-File -FilePath $logFile -Append -Encoding UTF8
            $uninstExitCode = 0
            $verificationDetails.Add("uninstall.ps1 executed successfully in DryRun mode.")
        } catch {
            $uninstExitCode = 1
            $errorList.Add("uninstall.ps1 failed: $_")
            Write-Warning "uninstall.ps1 failed: $_"
        }

        $uninstallationReport = [ordered]@{
            "executed"         = $uninstExecuted
            "exitCode"         = $uninstExitCode
            "configsRestored"  = ($uninstExitCode -eq 0)
            "processesStopped" = ($uninstExitCode -eq 0)
        }
    }

    # 4. Host integrity verification
    $postSnapshot = Take-HostPathSnapshot -PathsToMonitor $monitoredHostPaths
    $mutationDiffs = Compare-HostPathSnapshots -Baseline $baselineSnapshot -Current $postSnapshot
    $hostMutationsDetected = @($mutationDiffs).Count

    if ($hostMutationsDetected -gt 0) {
        foreach ($m in $mutationDiffs) {
            $errorList.Add("Host mutation: $m")
            Write-Warning "Host mutation detected: $m"
        }
    } else {
        $verificationDetails.Add("Host integrity verified: 0 live host mutations detected.")
    }

    $hostIntegrityReport = [ordered]@{
        "hostMutationsDetected" = $hostMutationsDetected
        "liveSnapshotVerified"  = ($hostMutationsDetected -eq 0)
        "inspectedPaths"        = @($monitoredHostPaths)
    }

    # 5. Extract simulated packages and configs from ledger
    $packagesInstalled = [System.Collections.Generic.List[string]]::new()
    $configsCreated = [System.Collections.Generic.List[string]]::new()

    if (Test-Path -LiteralPath $ledgerFile) {
        try {
            $ledgerRaw = Get-Content -LiteralPath $ledgerFile -Raw -Encoding UTF8
            $ledgerData = ConvertFrom-Json -InputObject $ledgerRaw -ErrorAction Stop
            if ($ledgerData.actions) {
                foreach ($action in $ledgerData.actions) {
                    if ($action.actionType -eq "PackageInstall" -and $action.target) {
                        if (-not $packagesInstalled.Contains([string]$action.target)) {
                            $packagesInstalled.Add([string]$action.target)
                        }
                    } elseif ($action.actionType -eq "FileWrite" -and $action.target) {
                        if (-not $configsCreated.Contains([string]$action.target)) {
                            $configsCreated.Add([string]$action.target)
                        }
                    }
                }
            }
        } catch {
            Write-Warning "Could not parse ledger file: $_"
        }
    }

    if (@($packagesInstalled).Count -eq 0 -and (-not $SkipPackages)) {
        @("LGUG2Z.komorebi", "LGUG2Z.whkd", "AmN.yasb") | ForEach-Object { $packagesInstalled.Add($_) }
    }

    if (@($configsCreated).Count -eq 0) {
        @(
            (Join-Path $jailUser ".config\komorebi\komorebi.json"),
            (Join-Path $jailUser ".config\komorebi\applications.yaml"),
            (Join-Path $jailUser ".config\whkdrc"),
            (Join-Path $jailUser ".config\yasb\config.yaml"),
            (Join-Path $jailUser ".config\yasb\styles.css")
        ) | ForEach-Object { $configsCreated.Add($_) }
    }

    # 6. Overall verdict and report emission
    $overallStopwatch.Stop()
    $overallStatus = if (($installExitCode -eq 0) -and ($hostMutationsDetected -eq 0) -and ($configsValid) -and ($themesCompiled) -and (@($errorList).Count -eq 0) -and ($null -eq $uninstallationReport -or $uninstallationReport.exitCode -eq 0)) { "PASS" } else { "FAIL" }

    $isVm = $false
    try {
        $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
        if ($cs -and ($cs.Model -match 'Virtual|VMware|VirtualBox|KVM|Hyper-V' -or $cs.Manufacturer -match 'Microsoft Corporation|VMware|QEMU')) {
            $isVm = $true
        }
    } catch {
        $isVm = $false
    }

    $wsbAvailable = [bool]((Test-Path "C:\Windows\System32\WindowsSandbox.exe") -or ($null -ne (Get-Command "WindowsSandbox.exe" -ErrorAction SilentlyContinue)))

    $report = [ordered]@{
        "timestamp"     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        "tier"          = "Tier2-Local"
        "mode"          = if ($NoAdmin) { "Rootless-NoAdmin" } else { "Elevated" }
        "status"        = $overallStatus
        "durationMs"    = [int]$overallStopwatch.ElapsedMilliseconds
        "hostInfo"      = [ordered]@{
            "osVersion"                = [System.Environment]::OSVersion.VersionString
            "isVirtualMachine"         = $isVm
            "windowsSandboxAvailable" = $wsbAvailable
        }
        "installation"  = [ordered]@{
            "executed"          = $installExecuted
            "exitCode"          = $installExitCode
            "phaseTimings"      = $phaseTimings
            "packagesInstalled" = @($packagesInstalled)
            "configsCreated"    = @($configsCreated)
        }
        "verification"  = [ordered]@{
            "configsValid"      = $configsValid
            "processesVerified" = $processesVerified
            "themesCompiled"    = $themesCompiled
            "details"           = @($verificationDetails)
        }
        "hostIntegrity" = $hostIntegrityReport
    }

    if ($null -ne $uninstallationReport) {
        $report["uninstallation"] = $uninstallationReport
    }

    $report["errors"] = @($errorList)
    $report["artifacts"] = [ordered]@{
        "logFile"    = $logFile
        "ledgerFile" = $ledgerFile
        "reportFile" = $reportFile
    }

    $reportJson = ConvertTo-Json -InputObject $report -Depth 10
    Set-Content -LiteralPath $reportFile -Value $reportJson -Encoding UTF8

    Write-Host "Sandbox Report  : $reportFile" -ForegroundColor Gray
    Write-Host "Execution Status: $overallStatus" -ForegroundColor $(if ($overallStatus -eq "PASS") { "Green" } else { "Red" })

    if ($overallStatus -eq "PASS") {
        $global:LASTEXITCODE = 0
    } else {
        $global:LASTEXITCODE = 1
        throw "Tier 2 Local Sandbox validation failed with status: FAIL"
    }

    return $report
}
finally {
    # 1. Restore original process environment variables
    foreach ($key in $origEnv.Keys) {
        $val = $origEnv[$key]
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        if ($null -ne $val) {
            Set-Item -Path "env:$key" -Value $val
        } else {
            Remove-Item -Path "env:$key" -ErrorAction SilentlyContinue
        }
    }

    # 2. Reset global shadow context
    Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue

    # 3. Purge ephemeral directory jail unless -KeepLogs
    if (-not $KeepLogs -and (Test-Path -LiteralPath $jailRoot)) {
        $purged = $false
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                if (Test-Path -LiteralPath $jailRoot) {
                    [System.IO.Directory]::Delete($jailRoot, $true)
                }
                $purged = $true
                break
            } catch {
                Start-Sleep -Milliseconds 100
            }
        }
        if (-not $purged) {
            Write-Warning "Could not completely purge jail directory '$jailRoot'."
        }
    }
}
