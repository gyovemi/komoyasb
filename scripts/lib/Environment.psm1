<#
.SYNOPSIS
    Environment detection, workspace resolution, and package management utilities.
.DESCRIPTION
    Provides core environmental helpers for path resolution, winget detection,
    safe filesystem directory provisioning, and transactional configuration backup.
.NOTES
    Part of the komoyasb desktop automation suite.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Import DryRunContext module
$dryRunModulePath = Join-Path $PSScriptRoot "DryRunContext.psm1"
if (Test-Path -LiteralPath $dryRunModulePath) {
    Import-Module $dryRunModulePath -Force
}

# In-memory single-pass snapshot cache of installed winget package IDs
if (-not (Get-Variable -Name "InstalledWingetPackagesCache" -Scope Script -ErrorAction SilentlyContinue)) {
    $script:InstalledWingetPackagesCache = $null
}

# Known candidate binary paths for fast pre-checks before querying winget
$progFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }
$localApp  = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { "" }
$progData  = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
$progFilesX86 = if (${env:ProgramFiles(x86)}) { ${env:ProgramFiles(x86)} } else { "C:\Program Files (x86)" }

$script:KnownPackageBinaryPaths = @{
    "LGUG2Z.komorebi" = @(
        (Join-Path $progFiles "komorebi\bin\komorebi.exe"),
        (Join-Path $progFiles "komorebi\komorebi.exe"),
        (Join-Path $localApp "Programs\komorebi\komorebi.exe")
    )
    "LGUG2Z.whkd" = @(
        (Join-Path $progFiles "whkd\bin\whkd.exe"),
        (Join-Path $progFiles "whkd\whkd.exe"),
        (Join-Path $localApp "Programs\whkd\whkd.exe")
    )
    "AmN.yasb" = @(
        (Join-Path $progFiles "yasb\yasb.exe"),
        (Join-Path $localApp "Programs\yasb\yasb.exe"),
        (Join-Path $localApp "Programs\yasb-reborn\yasb.exe")
    )
    "Flow-Launcher.Flow-Launcher" = @(
        (Join-Path $localApp "FlowLauncher\Flow.Launcher.exe"),
        (Join-Path $progFiles "Flow Launcher\Flow.Launcher.exe"),
        (Join-Path $localApp "Programs\FlowLauncher\Flow.Launcher.exe")
    )
    "voidtools.Everything" = @(
        (Join-Path $progFiles "Everything\Everything.exe"),
        (Join-Path $progFiles "voidtools\Everything\Everything.exe"),
        (Join-Path $progFilesX86 "Everything\Everything.exe")
    )
    "RamenSoftware.Windhawk" = @(
        (Join-Path $progData "Windhawk\Engine\windhawk-cli.exe"),
        (Join-Path $progFiles "Windhawk\windhawk-cli.exe"),
        (Join-Path $progFiles "Windhawk\windhawk.exe")
    )
    "File-New-Project.EarTrumpet" = @(
        (Join-Path $localApp "Programs\EarTrumpet\EarTrumpet.exe"),
        (Join-Path $progFiles "EarTrumpet\EarTrumpet.exe")
    )
}

function Get-InstalledWingetPackages {
    <#
    .SYNOPSIS
        Populates or retrieves the cached hashset of installed winget packages.
    .DESCRIPTION
        Executes 'winget list' once, parses output lines and package IDs into an in-memory
        HashSet for fast O(1) detection across subsequent package checks.
    .PARAMETER ForceRefresh
        Bypasses existing cache and re-queries winget.
    .OUTPUTS
        [System.Collections.Generic.HashSet[string]] Collection of installed package IDs.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [switch]$ForceRefresh
    )

    if ($null -ne $script:InstalledWingetPackagesCache -and -not $ForceRefresh) {
        return $script:InstalledWingetPackagesCache
    }

    $packageSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if (-not (Test-CommandAvailable -CommandName "winget")) {
        $script:InstalledWingetPackagesCache = $packageSet
        return $script:InstalledWingetPackagesCache
    }

    try {
        $rawOutput = & winget list --accept-source-agreements 2>&1
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            foreach ($outputLine in ($rawOutput -split "`r?`n")) {
                $trimmedLine = $outputLine.Trim()
                if (-not $trimmedLine -or $trimmedLine.StartsWith("-") -or $trimmedLine.StartsWith("Name ") -or $trimmedLine.StartsWith("ID ")) {
                    continue
                }
                $columnTokens = $trimmedLine -split '\s{2,}'
                if (@($columnTokens).Count -ge 2) {
                    $possibleId = $columnTokens[1].Trim()
                    if ($possibleId -and -not $possibleId.Contains(" ")) {
                        [void]$packageSet.Add($possibleId)
                    }
                }
                $matchedTokens = [regex]::Matches($trimmedLine, '\b([a-zA-Z0-9_\-]+(?:\.[a-zA-Z0-9_\-]+)+|[A-Z0-9]{12})\b')
                foreach ($tokenMatch in $matchedTokens) {
                    [void]$packageSet.Add($tokenMatch.Value)
                }
            }
        }
    }
    catch {
        Write-Warning "Failed populating winget snapshot cache: $_"
    }

    $script:InstalledWingetPackagesCache = $packageSet
    return $script:InstalledWingetPackagesCache
}

function Get-WorkspaceRoot {
    <#
    .SYNOPSIS
        Resolves the root directory of the komoyasb repository.
    .DESCRIPTION
        Navigates up the directory hierarchy seeking repository signature directories (themes, configs).
    .OUTPUTS
        [string] Absolute filesystem path to the repository root.
    #>
    [CmdletBinding()]
    param()

    $startDirs = @()
    if ($PSScriptRoot) {
        $startDirs += $PSScriptRoot
    }
    $cwd = (Get-Location).Path
    if ($cwd) {
        $startDirs += $cwd
    }

    foreach ($startDir in $startDirs) {
        $currentDir = $startDir
        while ($currentDir -and (Test-Path -LiteralPath $currentDir)) {
            if ((Test-Path -LiteralPath (Join-Path $currentDir "themes")) -and 
                (Test-Path -LiteralPath (Join-Path $currentDir "configs"))) {
                return (Resolve-Path -LiteralPath $currentDir).Path
            }
            if (Test-Path -LiteralPath (Join-Path $currentDir "docs\ARCHITECTURE.md")) {
                return (Resolve-Path -LiteralPath $currentDir).Path
            }
            $parentDir = Split-Path -Parent $currentDir
            if (-not $parentDir -or $parentDir -eq $currentDir) { break }
            $currentDir = $parentDir
        }
    }

    $isSystemDir = $false
    $systemFolders = @(
        [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::System),
        [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Windows),
        [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFiles),
        [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFilesX86)
    )
    foreach ($sysFolder in $systemFolders) {
        if ($sysFolder -and $cwd.StartsWith($sysFolder, [System.StringComparison]::OrdinalIgnoreCase)) {
            $isSystemDir = $true
            break
        }
    }

    $knownInstallPaths = @()
    if ($env:LOCALAPPDATA) {
        $knownInstallPaths += (Join-Path $env:LOCALAPPDATA "komoyasb")
    }
    if ($env:USERPROFILE) {
        $knownInstallPaths += (Join-Path $env:USERPROFILE ".komoyasb")
    }

    foreach ($path in $knownInstallPaths) {
        try {
            if ($path -and (Test-Path -LiteralPath $path -ErrorAction SilentlyContinue)) {
                if ((Test-Path -LiteralPath (Join-Path $path "themes") -ErrorAction SilentlyContinue) -and 
                    (Test-Path -LiteralPath (Join-Path $path "configs") -ErrorAction SilentlyContinue)) {
                    return (Resolve-Path -LiteralPath $path).Path
                }
            }
        } catch {}
    }

    if ($isSystemDir) {
        if (@($knownInstallPaths).Count -gt 0) {
            return $knownInstallPaths[0]
        }
    }

    return $cwd
}

function Test-IsAdministrator {
    <#
    .SYNOPSIS
        Evaluates whether the current PowerShell process has elevated Administrator privileges.
    .DESCRIPTION
        Inspects the WindowsPrincipal claims token of the current WindowsIdentity for the
        Builtin Administrators Security Identifier (SID S-1-5-32-544).
    .OUTPUTS
        [bool] True if running elevated with administrative token, false otherwise.
    #>
    [CmdletBinding()]
    param()

    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
        return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Test-CommandAvailable {
    <#
    .SYNOPSIS
        Checks if a CLI executable or PowerShell command exists in PATH.
    .PARAMETER CommandName
        The executable or cmdlet name to evaluate.
    .OUTPUTS
        [bool] True if command is available, false otherwise.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )

    return ($null -ne (Get-Command -Name $CommandName -ErrorAction SilentlyContinue))
}

function Test-WingetPackageInstalled {
    <#
    .SYNOPSIS
        Evaluates whether a target package ID is installed on the host.
    .DESCRIPTION
        First performs zero-cost inspection of known executable binary paths on disk.
        If absent, queries the in-memory winget snapshot cache.
    .PARAMETER PackageId
        Package ID identifier (e.g. "LGUG2Z.komorebi").
    .OUTPUTS
        [bool] True if package is installed or binary exists, false otherwise.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageId
    )

    if ($script:KnownPackageBinaryPaths.ContainsKey($PackageId)) {
        foreach ($candidatePath in $script:KnownPackageBinaryPaths[$PackageId]) {
            if ($candidatePath) {
                try {
                    if (Test-Path -LiteralPath $candidatePath -ErrorAction SilentlyContinue) {
                        return $true
                    }
                } catch {}
            }
        }
    }

    $cached = Get-InstalledWingetPackages
    return [bool]($cached -and $cached.Contains($PackageId))
}

function Install-WingetPackage {
    <#
    .SYNOPSIS
        Installs a package via Windows Package Manager (winget) or dry-run interceptor.
    .PARAMETER PackageId
        The winget package identifier to install.
    .PARAMETER CustomSource
        Optional source identifier (e.g. "msstore").
    .PARAMETER NoAdmin
        Forces rootless / non-admin installation mode.
    .PARAMETER DryRun
        Simulates installation without modifying system.
    .OUTPUTS
        [bool] True if installation succeeded or was simulated, false on failure.
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageId,

        [Parameter(Mandatory = $false)]
        [string]$CustomSource = "",

        [Parameter(Mandatory = $false)]
        [switch]$NoAdmin,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )

    $isDry = $DryRun -or (Test-IsDryRun)
    $isRootless = $NoAdmin -or (-not (Test-IsAdministrator))

    # Machine-only packages that require administrative rights
    $machineOnlyPackages = @("RamenSoftware.Windhawk")
    if ($isRootless -and ($machineOnlyPackages -contains $PackageId)) {
        Write-Warning "Skipping machine-scope package '$PackageId' in Rootless / Non-Admin mode. Native shell fallbacks will be used."
        if ($isDry) {
            [void](Invoke-SystemAction -ActionType "PackageInstall" -Target $PackageId -Metadata @{
                Action = "SkipMachineScope"
                PackageId = $PackageId
                Reason = "RootlessMode"
                Scope = "machine"
                Skipped = $true
            })
            Write-Host "[DRYRUN] Skipped machine-scope package $PackageId (Rootless mode)"
        }
        return $true
    }

    $sourceArg = if ($CustomSource) { "--source $CustomSource" } else { "" }
    $commonFlags = "--exact --silent --disable-interactivity --no-upgrade --scope user --accept-package-agreements --accept-source-agreements"

    if ($isDry) {
        $dryRunCmd = "winget install $commonFlags --id $PackageId $sourceArg".Trim()
        [void](Invoke-SystemAction -ActionType "PackageInstall" -Target $PackageId -Metadata @{
            CustomSource = $CustomSource
            Command = $dryRunCmd
            Scope = "user"
            PackageId = $PackageId
        })
        Write-Host "[DRYRUN] $dryRunCmd"
        return $true
    }

    if (-not (Test-CommandAvailable -CommandName "winget")) {
        Write-Warning "Cannot install ${PackageId}: winget is not available in PATH or execution environment."
        return $false
    }

    $wingetArguments = @("install", "--exact", "--silent", "--disable-interactivity", "--no-upgrade", "--scope", "user", "--id", $PackageId, "--accept-package-agreements", "--accept-source-agreements")
    if ($CustomSource) { $wingetArguments += @("--source", $CustomSource) }

    Write-Host "Installing $PackageId via winget..."
    try {
        $proc = Start-Process -FilePath "winget" -ArgumentList $wingetArguments -NoNewWindow -Wait -PassThru
        $alreadyInstalledCodes = @(0, -1978335189, [int]0x8A15002B, -1978335212, [int]0x8A150014)
        if ($alreadyInstalledCodes -contains $proc.ExitCode) {
            Write-Host "Winget package $PackageId installed successfully or already present."
            if ($null -ne $script:InstalledWingetPackagesCache) {
                [void]$script:InstalledWingetPackagesCache.Add($PackageId)
            }
            return $true
        }
        Write-Warning "Winget installation of $PackageId returned exit code $($proc.ExitCode)"
        return $false
    }
    catch {
        Write-Warning "Execution of winget failed for ${PackageId}: $_"
        return $false
    }
}

function Resolve-StandardPath {
    <#
    .SYNOPSIS
        Internal helper resolving a base folder with subpath and applying dry-run redirection.
    #>
    param(
        [string]$Base,
        [string]$SubPath
    )
    $livePath = if ($SubPath) { Join-Path $Base $SubPath } else { $Base }
    if (Test-IsDryRun) {
        return (Resolve-TargetPath -Path $livePath -Mode "Write")
    }
    return $livePath
}

function Get-UserConfigDir {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$SubPath)
    $userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
    return Resolve-StandardPath -Base (Join-Path $userProfile ".config") -SubPath $SubPath
}

function Get-AppDataDir {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$SubPath)
    $appData = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
    return Resolve-StandardPath -Base $appData -SubPath $SubPath
}

function Get-LocalAppDataDir {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$SubPath)
    $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }
    return Resolve-StandardPath -Base $localAppData -SubPath $SubPath
}

function New-DirectorySafely {
    <#
    .SYNOPSIS
        Creates a filesystem directory with dry-run interceptor support.
    .PARAMETER Path
        Target directory path.
    .PARAMETER DryRun
        Simulates directory creation.
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )

    if (Test-IsDryRun) {
        $targetDir = Resolve-TargetPath -Path $Path -Mode "Write"
        [void](Invoke-SystemAction -ActionType "DirectoryCreate" -Target $Path -Metadata @{
            virtualPath = $targetDir
            livePath = $Path
        })
        if (-not (Test-Path -LiteralPath $targetDir)) {
            [System.IO.Directory]::CreateDirectory($targetDir) | Out-Null
            Write-Verbose "Created shadow directory: $targetDir"
        }
        return
    }

    if ($DryRun) {
        Write-Host "[DRYRUN] Create directory $Path"
        return
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        [System.IO.Directory]::CreateDirectory($Path) | Out-Null
        Write-Verbose "Created directory: $Path"
    }
}

function ConvertTo-JsonSafe {
    <#
    .SYNOPSIS
        Converts an object or collection to a JSON-formatted string, preserving single-element arrays.
    .DESCRIPTION
        PowerShell 5.1 / 7 lacks automatic array preservation when single-element collections are passed
        via pipeline or serialized without -AsArray (which is unavailable in PS 5.1).
        This function guarantees that collections and arrays (like Backups in manifest.json)
        are serialized as JSON arrays '[ ... ]' rather than unwrapped single objects '{ ... }'.
    .PARAMETER InputObject
        The object or collection to serialize to JSON.
    .PARAMETER Depth
        Maximum serialization depth (default: 10).
    .PARAMETER Compress
        Omits white space and indented formatting.
    .PARAMETER AsArray
        Forces the root output to be formatted as a JSON array '[ ... ]'.
    .OUTPUTS
        [string] Formatted JSON string.
    .EXAMPLE
        ConvertTo-JsonSafe -InputObject $manifest -Depth 5
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        $InputObject,

        [Parameter(Mandatory = $false)]
        [int]$Depth = 10,

        [Parameter(Mandatory = $false)]
        [switch]$Compress,

        [Parameter(Mandatory = $false)]
        [switch]$AsArray
    )

    $isCollection = ($InputObject -is [System.Collections.IEnumerable] -and
                     $InputObject -isnot [System.Collections.IDictionary] -and
                     $InputObject -isnot [string])

    if ($AsArray -or $isCollection) {
        $json = if ($Compress) {
            ConvertTo-Json -InputObject @($InputObject) -Depth $Depth -Compress
        } else {
            ConvertTo-Json -InputObject @($InputObject) -Depth $Depth
        }
        $trimmed = $json.Trim()
        if (-not ($trimmed.StartsWith("[") -and $trimmed.EndsWith("]"))) {
            $json = "[$json]"
        }
        return $json
    }

    if ($InputObject -is [System.Collections.IDictionary]) {
        if ($InputObject.Contains("Backups")) {
            $InputObject["Backups"] = [object[]]@($InputObject["Backups"])
        }
    } elseif ($InputObject -is [psobject]) {
        if ($InputObject.PSObject.Properties["Backups"]) {
            $InputObject.Backups = [object[]]@($InputObject.Backups)
        }
    }

    $json = if ($Compress) {
        ConvertTo-Json -InputObject $InputObject -Depth $Depth -Compress
    } else {
        ConvertTo-Json -InputObject $InputObject -Depth $Depth
    }

    if ($json -match '("Backups"\s*:\s*)\{') {
        $json = [System.Text.RegularExpressions.Regex]::Replace(
            $json,
            '("Backups"\s*:\s*)(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})',
            '$1[$2]'
        )
    }

    return $json
}

function Backup-FileWithTimestamp {
    <#
    .SYNOPSIS
        Creates a timestamped snapshot backup of an existing target configuration file.
    .PARAMETER SourcePath
        Path of the file to back up.
    .PARAMETER BackupDir
        Target directory to store the backup snapshot.
    .PARAMETER DryRun
        Simulates backup without modifying host disk.
    .OUTPUTS
        [string] Path of the created backup file, or $null if source does not exist.
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,

        [Parameter(Mandatory = $true)]
        [string]$BackupDir,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )

    $effectiveSource = if (Test-IsDryRun) {
        Resolve-TargetPath -Path $SourcePath -Mode "Read"
    } else {
        $SourcePath
    }

    if (-not (Test-Path -LiteralPath $effectiveSource)) { return $null }

    $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
    $fileName = Split-Path -Leaf $SourcePath
    $backupLeaf = "$($fileName).backup_$timestamp"

    if (Test-IsDryRun) {
        $effectiveBackupDir = Resolve-TargetPath -Path $BackupDir -Mode "Write"
        New-DirectorySafely -Path $effectiveBackupDir
        $virtualTarget = Join-Path $effectiveBackupDir $backupLeaf
        $liveTarget = Join-Path $BackupDir $backupLeaf

        Copy-Item -LiteralPath $effectiveSource -Destination $virtualTarget -Force
        [void](Invoke-SystemAction -ActionType "FileWrite" -Target $liveTarget -Metadata @{
            virtualPath = $virtualTarget
            livePath = $liveTarget
            backupSource = $SourcePath
        })
        Write-Host "[DRYRUN] Backing up: $SourcePath -> $liveTarget (Virtual: $virtualTarget)"
        return $virtualTarget
    }

    if ($DryRun) {
        Write-Host "[DRYRUN] Backup $SourcePath to $BackupDir"
        return (Join-Path $BackupDir $fileName)
    }

    New-DirectorySafely -Path $BackupDir
    $targetPath = Join-Path $BackupDir $backupLeaf
    Copy-Item -LiteralPath $SourcePath -Destination $targetPath -Force
    Write-Host "Backing up: $SourcePath -> $targetPath"
    return $targetPath
}

Export-ModuleMember -Function `
    Get-WorkspaceRoot, `
    Get-InstalledWingetPackages, `
    Test-CommandAvailable, `
    Test-WingetPackageInstalled, `
    Test-IsAdministrator, `
    Install-WingetPackage, `
    Get-UserConfigDir, `
    Get-AppDataDir, `
    Get-LocalAppDataDir, `
    New-DirectorySafely, `
    ConvertTo-JsonSafe, `
    Backup-FileWithTimestamp, `
    Initialize-ShadowContext, `
    Resolve-TargetPath, `
    Invoke-SystemAction, `
    Export-ShadowLedger, `
    Reset-ShadowContext, `
    Test-IsDryRun, `
    Get-ShadowContext, `
    Get-Sha256Hash
