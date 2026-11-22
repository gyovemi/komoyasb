<#
.SYNOPSIS
    Enterprise-grade isolated shadow execution engine and system action interceptor.
.DESCRIPTION
    Provides transactional sandbox isolation for dry-run verification, intercepting
    file mutations, registry changes, package installs, and process operations into a shadow filesystem.
.NOTES
    Part of the komoyasb desktop automation suite.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256Hash {
    <#
    .SYNOPSIS
        Calculates the SHA-256 cryptographic hash of a given file.
    .DESCRIPTION
        Streams the file into System.Security.Cryptography.SHA256 and returns a lowercase hex string.
    .PARAMETER Path
        Absolute or relative path to the file.
    .OUTPUTS
        [string] Hexadecimal SHA-256 hash or $null if the file does not exist or cannot be read.
    .EXAMPLE
        Get-Sha256Hash -Path "C:\configs\komorebi.json"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    try {
        if (-not [System.IO.File]::Exists($Path)) { return $null }
        $shaHasher = [System.Security.Cryptography.SHA256]::Create()
        $fileStream = [System.IO.File]::OpenRead($Path)
        try {
            $hashBytes = $shaHasher.ComputeHash($fileStream)
            return [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $fileStream.Dispose()
            $shaHasher.Dispose()
        }
    }
    catch {
        return $null
    }
}

function Test-IsDryRun {
    <#
    .SYNOPSIS
        Evaluates whether an active shadow dry-run context is currently enforced.
    .DESCRIPTION
        Inspects global scope variable $KomoyasbShadowContext and confirms its Active state.
    .OUTPUTS
        [bool] True if dry-run context is active, false otherwise.
    #>
    [CmdletBinding()]
    param()

    $ctx = Get-ShadowContext
    return [bool]($null -ne $ctx -and $ctx.ContainsKey("Active") -and $ctx.Active)
}

function Get-ShadowContext {
    <#
    .SYNOPSIS
        Retrieves the current shadow execution context state.
    .DESCRIPTION
        Returns the active hashtable containing shadow root paths, action lists, and diff trackers.
    .OUTPUTS
        [hashtable] The shadow context state, or $null if not initialized.
    #>
    [CmdletBinding()]
    param()

    $contextVar = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    if ($null -ne $contextVar) { return $contextVar.Value }
    return $null
}

function Initialize-ShadowContext {
    <#
    .SYNOPSIS
        Initializes an isolated shadow directory tree for safe dry-run execution.
    .DESCRIPTION
        Creates isolated mirror directories for UserProfile, AppData, LocalAppData,
        ProgramData, Workspace, and filesystem paths to prevent any live system mutation.
    .PARAMETER ShadowRoot
        Optional custom root directory for the sandbox. If omitted, uses temporary directory.
    .PARAMETER PassthroughRead
        Allows reads to fall back to live filesystem targets when virtual shadow copy is absent.
    .PARAMETER EnforceZeroMutation
        Enforces runtime safety checks preventing write operations outside the shadow jail.
    .PARAMETER KeepSandbox
        Retains the shadow sandbox on disk after script termination instead of auto-purging.
    .PARAMETER WorkspaceRoot
        Path to the repository workspace root.
    .OUTPUTS
        [hashtable] The initialized shadow context object.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$ShadowRoot = "",

        [Parameter(Mandatory = $false)]
        [switch]$PassthroughRead = $true,

        [Parameter(Mandatory = $false)]
        [switch]$EnforceZeroMutation = $true,

        [Parameter(Mandatory = $false)]
        [switch]$KeepSandbox = $false,

        [Parameter(Mandatory = $false)]
        [string]$WorkspaceRoot = ""
    )

    $sessionId = [System.Guid]::NewGuid().ToString()
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    if ([string]::IsNullOrWhiteSpace($ShadowRoot)) {
        $uiSandbox = [System.Environment]::GetEnvironmentVariable("UI_SANDBOX_DIR")
        if ($uiSandbox -and (Test-Path -LiteralPath $uiSandbox)) {
            $ShadowRoot = Join-Path $uiSandbox "komoyasb-dryrun-$sessionId"
        }
        else {
            $tempDir = [System.IO.Path]::GetTempPath()
            $timestampFolder = (Get-Date).ToString("yyyyMMdd_HHmmss")
            $ShadowRoot = Join-Path $tempDir "komoyasb-dryrun-$timestampFolder-$sessionId"
        }
    }
    $ShadowRoot = [System.IO.Path]::GetFullPath($ShadowRoot)

    if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
        $currentDir = $PSScriptRoot
        while ($currentDir -and (Test-Path -LiteralPath $currentDir)) {
            if ((Test-Path -LiteralPath (Join-Path $currentDir "themes")) -and 
                (Test-Path -LiteralPath (Join-Path $currentDir "configs"))) {
                $WorkspaceRoot = (Resolve-Path -LiteralPath $currentDir).Path
                break
            }
            $parentDir = Split-Path -Parent $currentDir
            if ($parentDir -eq $currentDir) { break }
            $currentDir = $parentDir
        }
        if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
            $WorkspaceRoot = (Get-Location).Path
        }
    }
    $WorkspaceRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)

    $subdirs = @{
        UserProfile  = Join-Path $ShadowRoot "userprofile"
        AppData      = Join-Path $ShadowRoot "appdata"
        LocalAppData = Join-Path $ShadowRoot "localappdata"
        ProgramData  = Join-Path $ShadowRoot "programdata"
        Workspace    = Join-Path $ShadowRoot "workspace"
        Fs           = Join-Path $ShadowRoot "fs"
    }

    [System.IO.Directory]::CreateDirectory($ShadowRoot) | Out-Null
    foreach ($dir in $subdirs.Values) {
        if (-not (Test-Path -LiteralPath $dir)) {
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        }
    }

    $shadowContext = @{
        Active              = $true
        SessionId           = $sessionId
        Timestamp           = $timestamp
        ShadowRoot          = $ShadowRoot
        KeepSandbox         = [bool]$KeepSandbox
        PassthroughRead     = [bool]$PassthroughRead
        EnforceZeroMutation = [bool]$EnforceZeroMutation
        WorkspaceRoot       = $WorkspaceRoot
        Actions             = [System.Collections.Generic.List[psobject]]::new()
        FileDiffs           = [System.Collections.Generic.Dictionary[string, psobject]]::new([System.StringComparer]::OrdinalIgnoreCase)
        Directories         = $subdirs
    }

    Set-Variable -Name "KomoyasbShadowContext" -Value $shadowContext -Scope Global
    Write-Verbose "ShadowContext initialized at '$ShadowRoot' (Session: $sessionId)"
    return $shadowContext
}

function Resolve-TargetPath {
    <#
    .SYNOPSIS
        Translates live host filesystem paths into isolated shadow equivalents.
    .DESCRIPTION
        Inspects incoming file paths and maps them to sandbox root directories using longest-prefix matching.
        In Read mode, supports transparent passthrough to live system paths if the shadow copy is not yet populated.
        Enforces filesystem sandbox jail validation to guarantee zero host pollution.
    .PARAMETER Path
        The target filesystem path to evaluate.
    .PARAMETER Mode
        Access mode: "Write" (forces shadow redirect), "Read" (supports passthrough), or "Exists".
    .OUTPUTS
        [string] The redirected virtual shadow path or untouched live path.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [ValidateSet("Read", "Write", "Exists")]
        [string]$Mode = "Write"
    )

    if (-not (Test-IsDryRun)) { return $Path }

    $activeContext = Get-ShadowContext
    $shadowRoot = $activeContext.ShadowRoot
    $normalizedPath = [System.IO.Path]::GetFullPath($Path)

    if ($normalizedPath.StartsWith($shadowRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $normalizedPath
    }

    # Resolve live base roots for comparison in priority order (subdirs before parents)
    $envUser = [System.Environment]::GetEnvironmentVariable("USERPROFILE")
    $envApp  = [System.Environment]::GetEnvironmentVariable("APPDATA")
    $envLocal= [System.Environment]::GetEnvironmentVariable("LOCALAPPDATA")
    $envProg = [System.Environment]::GetEnvironmentVariable("ProgramData")

    $pathPrefixMap = @(
        @{ Live = if ($envApp) { [System.IO.Path]::GetFullPath($envApp) } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }; Target = $activeContext.Directories.AppData },
        @{ Live = if ($envLocal) { [System.IO.Path]::GetFullPath($envLocal) } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }; Target = $activeContext.Directories.LocalAppData },
        @{ Live = if ($envProg) { [System.IO.Path]::GetFullPath($envProg) } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::CommonApplicationData) }; Target = $activeContext.Directories.ProgramData },
        @{ Live = [System.IO.Path]::GetFullPath($activeContext.WorkspaceRoot); Target = $activeContext.Directories.Workspace },
        @{ Live = if ($envUser) { [System.IO.Path]::GetFullPath($envUser) } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }; Target = $activeContext.Directories.UserProfile }
    )

    $resolvedVirtual = $null
    foreach ($entry in $pathPrefixMap) {
        if ($entry.Live -and $normalizedPath.StartsWith($entry.Live, [System.StringComparison]::OrdinalIgnoreCase)) {
            $sub = $normalizedPath.Substring($entry.Live.Length).TrimStart('\', '/')
            $resolvedVirtual = Join-Path $entry.Target $sub
            break
        }
    }

    if (-not $resolvedVirtual) {
        $driveLetter = [System.IO.Path]::GetPathRoot($normalizedPath).TrimEnd([char[]]@(':', '\', '/'))
        $withoutRoot = $normalizedPath.Substring([System.IO.Path]::GetPathRoot($normalizedPath).Length)
        $resolvedVirtual = Join-Path (Join-Path $activeContext.Directories.Fs $driveLetter) $withoutRoot
    }

    # Fallback to live path for Read/Exists if virtual path does not exist
    if ($Mode -in @("Read", "Exists") -and $activeContext.PassthroughRead) {
        $virtualExists = [System.IO.File]::Exists($resolvedVirtual) -or [System.IO.Directory]::Exists($resolvedVirtual)
        if (-not $virtualExists) {
            $liveExists = [System.IO.File]::Exists($normalizedPath) -or [System.IO.Directory]::Exists($normalizedPath)
            if ($liveExists) { return $normalizedPath }
        }
    }

    if ($Mode -eq "Write" -and $activeContext.EnforceZeroMutation) {
        if (-not $resolvedVirtual.StartsWith($shadowRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw [System.Security.SecurityException]::new("Shadow Jail Violation: Target path '$resolvedVirtual' escapes ShadowRoot '$shadowRoot'.")
        }
    }

    return $resolvedVirtual
}

function Invoke-SystemAction {
    <#
    .SYNOPSIS
        Intercepts mutating system actions during dry-run or dispatches them live.
    .DESCRIPTION
        Records structural ledger events and diff tracking for file writes, deletions, registry modifications,
        package installations, process controls, and wallpaper applications.
    .PARAMETER ActionType
        Type of operation to record.
    .PARAMETER Target
        The target resource name or path being acted upon.
    .PARAMETER Metadata
        Arbitrary metadata hashtable associated with the event.
    .PARAMETER LiveAction
        Executable scriptblock executed only when dry-run mode is inactive.
    .OUTPUTS
        [bool] Returns true if simulated or executed successfully.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("FileWrite", "FileDelete", "DirectoryCreate", "RegistryWrite", "PackageInstall", "ProcessControl", "WallpaperApply", "WindhawkMod")]
        [string]$ActionType,

        [Parameter(Mandatory = $true)]
        [string]$Target,

        [Parameter(Mandatory = $false)]
        [hashtable]$Metadata = @{},

        [Parameter(Mandatory = $false)]
        [scriptblock]$LiveAction = $null
    )

    if (-not (Test-IsDryRun)) {
        if ($null -ne $LiveAction) {
            try { return (& $LiveAction) }
            catch {
                Write-Error "LiveAction execution failed for ${ActionType} on ${Target}: $_"
                throw $_
            }
        }
        return $true
    }

    $activeContext = Get-ShadowContext
    $actionRecord = [pscustomobject]@{
        id         = [System.Guid]::NewGuid().ToString()
        timestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        actionType = $ActionType
        target     = $Target
        status     = "Simulated"
        metadata   = $Metadata
    }
    $activeContext.Actions.Add($actionRecord)

    if ($ActionType -in @("FileWrite", "FileDelete")) {
        $virtualPath = if ($Metadata.ContainsKey("virtualPath")) { [string]$Metadata["virtualPath"] } else { $Target }
        $livePath    = if ($Metadata.ContainsKey("livePath")) { [string]$Metadata["livePath"] } else { $Target }

        $origHash   = if ([System.IO.File]::Exists($livePath)) { Get-Sha256Hash -Path $livePath } else { $null }
        $virtualExists = [System.IO.File]::Exists($virtualPath)
        $shadowHash = if ($virtualExists) { Get-Sha256Hash -Path $virtualPath } else { $null }
        $byteSize   = if ($virtualExists) { (Get-Item -LiteralPath $virtualPath -ErrorAction SilentlyContinue).Length } else { 0 }

        $changeType = if ($ActionType -eq "FileDelete") { "Deleted" }
                      elseif ($null -eq $origHash) { "Created" }
                      elseif ($origHash -eq $shadowHash) { "Unchanged" }
                      else { "Modified" }

        if ($ActionType -eq "FileDelete") {
            $shadowHash = $null
            $byteSize   = 0
        }

        $activeContext.FileDiffs[$livePath] = [pscustomobject]@{
            targetVirtualPath = $virtualPath
            targetLivePath    = $livePath
            changeType        = $changeType
            originalSha256    = $origHash
            shadowSha256      = $shadowHash
            byteSize          = [int]$byteSize
        }
    }

    Write-Verbose "[DryRun-Action] $ActionType on $Target (Status: Simulated)"
    return $true
}

function Export-ShadowLedger {
    <#
    .SYNOPSIS
        Serializes and exports the collected shadow dry-run ledger to JSON.
    .DESCRIPTION
        Compiles all intercepted system actions, file differences, and summary statistics
        into a structured schema-compliant JSON artifact.
    .PARAMETER OutputPath
        Optional path to write the JSON ledger file to disk.
    .OUTPUTS
        [ordered] The structured ledger dictionary object.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$OutputPath = ""
    )

    $activeContext = Get-ShadowContext
    $isDry = Test-IsDryRun
    $sessionId  = if ($activeContext -and $activeContext.ContainsKey("SessionId")) { [string]$activeContext.SessionId } else { [System.Guid]::NewGuid().ToString() }
    $shadowRoot = if ($activeContext -and $activeContext.ContainsKey("ShadowRoot")) { [string]$activeContext.ShadowRoot } else { $null }

    $actionsList = [psobject[]]@()
    if ($activeContext -and $activeContext.ContainsKey("Actions") -and $null -ne $activeContext.Actions) {
        $actionsList = [psobject[]]$activeContext.Actions.ToArray()
    }

    $fileDiffsList = [psobject[]]@()
    if ($activeContext -and $activeContext.ContainsKey("FileDiffs") -and $null -ne $activeContext.FileDiffs) {
        $fileDiffsList = [psobject[]]@($activeContext.FileDiffs.Values)
    }

    $summaryCounts = @{ FileWrite = 0; FileDelete = 0; RegistryWrite = 0; PackageInstall = 0; ProcessControl = 0 }
    foreach ($a in $actionsList) {
        if ($summaryCounts.ContainsKey($a.actionType)) { $summaryCounts[$a.actionType]++ }
    }

    $ledger = [ordered]@{
        "`$schema"    = "http://json-schema.org/draft-07/schema#"
        "sessionId"   = $sessionId
        "timestamp"   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        "isDryRun"    = [bool]$isDry
        "shadowRoot"  = $shadowRoot
        "summary"     = [ordered]@{
            "totalActions"        = [int]@($actionsList).Count
            "filesWritten"        = [int]$summaryCounts["FileWrite"]
            "filesDeleted"        = [int]$summaryCounts["FileDelete"]
            "registryWrites"      = [int]$summaryCounts["RegistryWrite"]
            "packagesSimulated"   = [int]$summaryCounts["PackageInstall"]
            "processesControlled" = [int]$summaryCounts["ProcessControl"]
        }
        "actions"     = $actionsList
        "fileDiffs"   = $fileDiffsList
    }

    $json = ConvertTo-Json -InputObject $ledger -Depth 10
    if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
        $parentDir = Split-Path -Parent $OutputPath
        if ($parentDir -and -not (Test-Path -LiteralPath $parentDir)) {
            [System.IO.Directory]::CreateDirectory($parentDir) | Out-Null
        }
        [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Verbose "Exported shadow ledger to $OutputPath"
    }

    return $ledger
}

function Reset-ShadowContext {
    <#
    .SYNOPSIS
        Resets and cleans up the active shadow execution environment.
    .DESCRIPTION
        Purges temporary sandbox files if requested or configured, and removes global context variables.
    .PARAMETER PurgeFiles
        Forces complete deletion of the shadow sandbox directory.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [switch]$PurgeFiles = $false
    )

    $contextVar = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    if ($null -ne $contextVar -and $null -ne $contextVar.Value) {
        $activeContext = $contextVar.Value
        $shadowRoot = $activeContext.ShadowRoot
        if (($PurgeFiles -or (-not $activeContext.KeepSandbox)) -and $shadowRoot -and (Test-Path -LiteralPath $shadowRoot)) {
            try {
                [System.IO.Directory]::Delete($shadowRoot, $true)
                Write-Verbose "Purged shadow sandbox directory: $shadowRoot"
            }
            catch {
                Write-Warning "Could not completely purge shadow directory ${shadowRoot}: $_"
            }
        }
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    }
}

Export-ModuleMember -Function `
    Initialize-ShadowContext, `
    Resolve-TargetPath, `
    Invoke-SystemAction, `
    Export-ShadowLedger, `
    Reset-ShadowContext, `
    Test-IsDryRun, `
    Get-ShadowContext, `
    Get-Sha256Hash
