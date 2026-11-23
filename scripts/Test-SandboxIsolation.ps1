<#
.SYNOPSIS
    Cryptographic host isolation and zero-mutation validation harness for komoyasb.
.DESCRIPTION
    Validates the Tier 2 Local Isolated Profile Sandbox:
    1. Captures a recursive baseline SHA-256 cryptographic snapshot of live host target paths:
       - $env:USERPROFILE\.config\komorebi
       - $env:USERPROFILE\.config\yasb
       - $env:USERPROFILE\.config\whkdrc
       - $env:APPDATA\FlowLauncher
       - $env:LOCALAPPDATA\komoyasb
       - Repository source trees (configs/, themes/, scripts/).
    2. Executes Invoke-LocalSandbox.ps1 under both standard (Elevated) and rootless (-NoAdmin) modes.
    3. Asserts that ephemeral directory jails ($env:TEMP\komoyasb-localjail-<guid>) are completely
       purged post-execution when -KeepLogs is not supplied.
    4. Computes post-execution cryptographic hashes across all monitored host targets and asserts
       zero (0) file creations, modifications, or deletions outside the jail.
    5. Exits with code 0 on PASS, 1 on FAIL.

    Part of the Two-Tier Installation Sandbox architecture specified in docs/SANDBOX_ARCHITECTURE.md.
.PARAMETER KeepLogs
    Retains test session directories and sandbox reports after completion for debugging.
.OUTPUTS
    Exit code 0 on PASS, 1 on FAIL.
.EXAMPLE
    .\scripts\Test-SandboxIsolation.ps1
.EXAMPLE
    .\scripts\Test-SandboxIsolation.ps1 -KeepLogs
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$KeepLogs
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
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$localSandboxScript = Join-Path $repoRoot "scripts\sandbox\Invoke-LocalSandbox.ps1"

if (-not (Test-Path -LiteralPath $localSandboxScript)) {
    Write-Error "Local sandbox launcher not found at: $localSandboxScript"
    exit 1
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  komoyasb Tier 2 Local Sandbox Isolation & Immutability Gate   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Repo Root : $repoRoot" -ForegroundColor Gray
Write-Host "KeepLogs  : $KeepLogs" -ForegroundColor Gray
Write-Host "----------------------------------------------------------------" -ForegroundColor DarkGray

# 1. Resolve live host paths to monitor
$liveUserProfile  = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
$liveAppData      = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
$liveLocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }

$monitoredPaths = @(
    (Join-Path $liveUserProfile ".config\komorebi"),
    (Join-Path $liveUserProfile ".config\yasb"),
    (Join-Path $liveUserProfile ".config\whkdrc"),
    (Join-Path $liveAppData "FlowLauncher"),
    (Join-Path $liveLocalAppData "komoyasb"),
    (Join-Path $repoRoot "configs"),
    (Join-Path $repoRoot "themes"),
    (Join-Path $repoRoot "scripts")
)

Write-Host "[1/4] Capturing baseline SHA-256 cryptographic snapshot of live host targets..." -ForegroundColor Yellow
$baselineSnapshot = Take-HostPathSnapshot -PathsToMonitor $monitoredPaths
Write-Host "  Monitored target paths: $(@($monitoredPaths).Count)" -ForegroundColor Gray

# Create isolated output directory for test telemetry
$testGuid = [System.Guid]::NewGuid().ToString("N")
$testSessionRoot = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-isolation-test-$testGuid"
$outDir1 = Join-Path $testSessionRoot "run1-standard"
$outDir2 = Join-Path $testSessionRoot "run2-noadmin"

[System.IO.Directory]::CreateDirectory($testSessionRoot) | Out-Null
[System.IO.Directory]::CreateDirectory($outDir1) | Out-Null
[System.IO.Directory]::CreateDirectory($outDir2) | Out-Null

$testFailures = [System.Collections.Generic.List[string]]::new()

try {
    # 2. Run 1: Standard / Elevated Mode
    Write-Host "`n[2/4] Executing Invoke-LocalSandbox.ps1 under Standard mode..." -ForegroundColor Yellow
    $run1Args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $localSandboxScript,
        "-OutputDir", $outDir1,
        "-Theme", "dark",
        "-TestUninstall"
    )

    & powershell.exe @run1Args
    $run1ExitCode = $LASTEXITCODE

    if ($run1ExitCode -ne 0) {
        $testFailures.Add("Run 1 (Standard mode) failed with exit code: $run1ExitCode")
    } else {
        Write-Host "  [OK] Standard mode completed with exit code 0." -ForegroundColor Green
    }

    # Verify Run 1 report schema and assertions
    $report1Path = Join-Path $outDir1 "sandbox-report.json"
    if (-not (Test-Path -LiteralPath $report1Path)) {
        $testFailures.Add("Run 1 did not emit sandbox-report.json at: $report1Path")
    } else {
        $rep1 = Get-Content -LiteralPath $report1Path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($rep1.status -ne "PASS") {
            $testFailures.Add("Run 1 report status is not PASS: $($rep1.status)")
        }
        if ($rep1.tier -ne "Tier2-Local") {
            $testFailures.Add("Run 1 report tier is not Tier2-Local: $($rep1.tier)")
        }
        if (-not $rep1.installation.executed) {
            $testFailures.Add("Run 1 installation.executed is not true")
        }
        if (-not $rep1.verification.configsValid) {
            $testFailures.Add("Run 1 verification.configsValid is not true")
        }
        if ($rep1.hostIntegrity.hostMutationsDetected -ne 0) {
            $testFailures.Add("Run 1 hostIntegrity reports $($rep1.hostIntegrity.hostMutationsDetected) mutations")
        }

        # Assert jail cleanup
        $jailLine1 = @($rep1.verification.details) | Where-Object { $_ -match '^JailDirectory:\s*(.+)$' }
        if ($jailLine1 -and ($jailLine1 -match '^JailDirectory:\s*(.+)$')) {
            $jail1Path = $Matches[1].Trim()
            if (Test-Path -LiteralPath $jail1Path) {
                $testFailures.Add("Run 1 ephemeral jail directory was NOT purged: $jail1Path")
            } else {
                Write-Host "  [OK] Run 1 ephemeral jail directory was cleanly purged: $jail1Path" -ForegroundColor Green
            }
        }
    }

    # 3. Run 2: Rootless / NoAdmin Mode
    Write-Host "`n[3/4] Executing Invoke-LocalSandbox.ps1 under Rootless (-NoAdmin) mode..." -ForegroundColor Yellow
    $run2Args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $localSandboxScript,
        "-OutputDir", $outDir2,
        "-NoAdmin",
        "-Theme", "dark",
        "-TestUninstall"
    )

    & powershell.exe @run2Args
    $run2ExitCode = $LASTEXITCODE

    if ($run2ExitCode -ne 0) {
        $testFailures.Add("Run 2 (NoAdmin mode) failed with exit code: $run2ExitCode")
    } else {
        Write-Host "  [OK] Rootless (-NoAdmin) mode completed with exit code 0." -ForegroundColor Green
    }

    # Verify Run 2 report schema and assertions
    $report2Path = Join-Path $outDir2 "sandbox-report.json"
    if (-not (Test-Path -LiteralPath $report2Path)) {
        $testFailures.Add("Run 2 did not emit sandbox-report.json at: $report2Path")
    } else {
        $rep2 = Get-Content -LiteralPath $report2Path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($rep2.status -ne "PASS") {
            $testFailures.Add("Run 2 report status is not PASS: $($rep2.status)")
        }
        if ($rep2.tier -ne "Tier2-Local") {
            $testFailures.Add("Run 2 report tier is not Tier2-Local: $($rep2.tier)")
        }
        if ($rep2.mode -ne "Rootless-NoAdmin") {
            $testFailures.Add("Run 2 report mode is not Rootless-NoAdmin: $($rep2.mode)")
        }
        if (-not $rep2.installation.executed) {
            $testFailures.Add("Run 2 installation.executed is not true")
        }
        if (-not $rep2.verification.configsValid) {
            $testFailures.Add("Run 2 verification.configsValid is not true")
        }
        if ($rep2.hostIntegrity.hostMutationsDetected -ne 0) {
            $testFailures.Add("Run 2 hostIntegrity reports $($rep2.hostIntegrity.hostMutationsDetected) mutations")
        }

        # Assert jail cleanup
        $jailLine2 = @($rep2.verification.details) | Where-Object { $_ -match '^JailDirectory:\s*(.+)$' }
        if ($jailLine2 -and ($jailLine2 -match '^JailDirectory:\s*(.+)$')) {
            $jail2Path = $Matches[1].Trim()
            if (Test-Path -LiteralPath $jail2Path) {
                $testFailures.Add("Run 2 ephemeral jail directory was NOT purged: $jail2Path")
            } else {
                Write-Host "  [OK] Run 2 ephemeral jail directory was cleanly purged: $jail2Path" -ForegroundColor Green
            }
        }
    }

    # 4. Post-execution host integrity verification
    Write-Host "`n[4/4] Taking post-execution cryptographic snapshot and asserting host zero-mutation..." -ForegroundColor Yellow
    $postExecutionSnapshot = Take-HostPathSnapshot -PathsToMonitor $monitoredPaths
    $hostDifferences = Compare-HostPathSnapshots -Baseline $baselineSnapshot -Current $postExecutionSnapshot

    if (@($hostDifferences).Count -gt 0) {
        Write-Host "FATAL: Live host mutations detected across test runs:" -ForegroundColor Red
        foreach ($diff in $hostDifferences) {
            Write-Host "  - $diff" -ForegroundColor Red
            $testFailures.Add("Live host mutation: $diff")
        }
    } else {
        Write-Host "  [OK] 0 live host mutations detected. All monitored paths are completely untouched." -ForegroundColor Green
    }
}
finally {
    if (-not $KeepLogs -and (Test-Path -LiteralPath $testSessionRoot)) {
        try {
            [System.IO.Directory]::Delete($testSessionRoot, $true)
        } catch {
            Start-Sleep -Milliseconds 100
            try { [System.IO.Directory]::Delete($testSessionRoot, $true) } catch {}
        }
    }
}

Write-Host "================================================================" -ForegroundColor Cyan
if (@($testFailures).Count -eq 0) {
    Write-Host "  [PASS] 100% Host Isolation & Zero-Mutation Invariants Verified!" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "  [FAIL] Host Isolation verification failed with $(@($testFailures).Count) error(s):" -ForegroundColor Red
    foreach ($err in $testFailures) {
        Write-Host "    * $err" -ForegroundColor Red
    }
    Write-Host "================================================================" -ForegroundColor Cyan
    exit 1
}
