#requires -Version 5.1
<#
.SYNOPSIS
    One-line bootstrap script to fetch, install, and configure the komoyasb environment.
.DESCRIPTION
    Clones or downloads the latest komoyasb repository into $LOCALAPPDATA\komoyasb
    and executes install.ps1 with all supplied arguments.
.PARAMETER RepoUrl
    Git repository or release URL. Defaults to 'https://github.com/gyovemi/komoyasb'.
.PARAMETER Branch
    Branch to clone or download. Defaults to 'main'.
.PARAMETER InstallDir
    Target directory where komoyasb will be cloned/extracted. Defaults to '$env:LOCALAPPDATA\komoyasb'.
.PARAMETER ExpectedSha256
    Optional cryptographic SHA-256 hash to verify downloaded release archive integrity.
.PARAMETER NoAdmin
    Forces rootless execution mode without administrative rights. Forwarded to install.ps1.
    Automatically enabled when not running with elevated Administrator privileges.
.PARAMETER ForwardArgs
    Optional parameters passed forward to install.ps1 (e.g. -Theme, -DryRun, -SkipPackages).
.EXAMPLE
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/gyovemi/komoyasb/main/bootstrap.ps1" -OutFile "$env:TEMP\bootstrap.ps1"; & "$env:TEMP\bootstrap.ps1" -NoAdmin
.EXAMPLE
    & "$env:TEMP\bootstrap.ps1" -Theme light -DryRun -NoAdmin
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $false)]
    [string]$RepoUrl = "https://github.com/gyovemi/komoyasb",

    [Parameter(Mandatory = $false)]
    [string]$Branch = "main",

    [Parameter(Mandatory = $false)]
    [string]$InstallDir = $(Join-Path $env:LOCALAPPDATA "komoyasb"),

    [Parameter(Mandatory = $false)]
    [string]$ExpectedSha256 = "",

    [Parameter(Mandatory = $false)]
    [switch]$NoAdmin,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-BootstrapHeader {
    <#
    .SYNOPSIS
        Displays the CLI banner for the bootstrap process.
    .DESCRIPTION
        Outputs styled console text headers indicating bootstrap initialization.
    .OUTPUTS
        None.
    .EXAMPLE
        Write-BootstrapHeader
    #>
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host "     komoyasb Fast Bootstrap Engine" -ForegroundColor White
    Write-Host "     Production-Grade Windows 11 Desktop Environment" -ForegroundColor DarkGray
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-BootstrapHeader

function Test-IsAdministratorBootstrap {
    <#
    .SYNOPSIS
        Evaluates whether current process has elevated Administrator privileges.
    #>
    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
        return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

$isAdmin = Test-IsAdministratorBootstrap
$rootlessMode = $NoAdmin -or (-not $isAdmin)

if ($rootlessMode) {
    Write-Host "[komoyasb:bootstrap] Operating in ROOTLESS MODE (Non-Admin / Zero-UAC)." -ForegroundColor Cyan
} else {
    Write-Host "[komoyasb:bootstrap] Operating in ELEVATED MODE (Administrator)." -ForegroundColor Yellow
}

Write-Host "[komoyasb:bootstrap] Target installation directory: $InstallDir" -ForegroundColor Cyan

# 1. Determine if git is available
$hasGit = $false
try {
    $gitCmd = Get-Command "git" -ErrorAction SilentlyContinue
    if ($null -ne $gitCmd) {
        $hasGit = $true
    }
}
catch {
    $hasGit = $false
}

if ($hasGit) {
    Write-Host "[komoyasb:bootstrap] Git detected. Using git shallow clone / pull..." -ForegroundColor Green
    if (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) {
        Write-Host "[komoyasb:bootstrap] Existing repository found at $InstallDir. Updating via git pull..." -ForegroundColor Yellow
        git -C $InstallDir pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "[komoyasb:bootstrap] git pull returned exit code $LASTEXITCODE. Continuing with local files..."
        }
    }
    else {
        if (Test-Path -LiteralPath $InstallDir) {
            Write-Host "[komoyasb:bootstrap] Directory exists but is not a git repo. Re-initializing clone..." -ForegroundColor Yellow
            Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        $parentDir = Split-Path -Parent $InstallDir
        if (-not (Test-Path -LiteralPath $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        git clone --depth 1 --branch $Branch $RepoUrl $InstallDir
        if ($LASTEXITCODE -ne 0) {
            throw "[komoyasb:bootstrap] git clone failed with exit code $LASTEXITCODE"
        }
    }
}
else {
    Write-Host "[komoyasb:bootstrap] Git not found. Downloading ZIP release archive from GitHub..." -ForegroundColor Yellow
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

    # Derive zip url from github repository URL
    # E.g. https://github.com/gyovemi/komoyasb -> https://github.com/gyovemi/komoyasb/archive/refs/heads/main.zip
    $zipUrl = "$($RepoUrl.TrimEnd('/'))/archive/refs/heads/$Branch.zip"
    $tempZipPath = Join-Path $env:TEMP ("komoyasb-bootstrap-" + [System.Guid]::NewGuid().ToString("N") + ".zip")
    $tempExtractPath = Join-Path $env:TEMP ("komoyasb-extract-" + [System.Guid]::NewGuid().ToString("N"))

    try {
        Write-Host "[komoyasb:bootstrap] Fetching archive: $zipUrl" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $zipUrl -OutFile $tempZipPath -UseBasicParsing

        # SHA-256 Checksum Verification if provided or available
        $checksumToVerify = $ExpectedSha256
        if (-not $checksumToVerify) {
            try {
                $checksumResp = Invoke-WebRequest -Uri "$zipUrl.sha256" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
                if ($checksumResp -and $checksumResp.Content) {
                    $checksumMatch = [regex]::Match($checksumResp.Content, '[a-fA-F0-9]{64}')
                    if ($checksumMatch.Success) {
                        $checksumToVerify = $checksumMatch.Value
                    }
                }
            } catch {}
        }
        if ($checksumToVerify) {
            Write-Host "[komoyasb:bootstrap] Verifying SHA-256 archive checksum..." -ForegroundColor Cyan
            $actualHash = (Get-FileHash -Path $tempZipPath -Algorithm SHA256).Hash
            if (-not $actualHash.Equals($checksumToVerify.Trim(), [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "[komoyasb:bootstrap] Checksum verification failed! Expected: $checksumToVerify, Actual: $actualHash"
            }
            Write-Host "[komoyasb:bootstrap] SHA-256 checksum verified successfully ($actualHash)." -ForegroundColor Green
        }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        Write-Host "[komoyasb:bootstrap] Extracting payload to staging area with Zip Slip validation..." -ForegroundColor Cyan

        $canonicalExtractRoot = [System.IO.Path]::GetFullPath($tempExtractPath)
        if (-not $canonicalExtractRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar.ToString())) {
            $canonicalExtractRoot += [System.IO.Path]::DirectorySeparatorChar
        }
        if (-not (Test-Path -LiteralPath $tempExtractPath)) {
            New-Item -ItemType Directory -Path $tempExtractPath -Force | Out-Null
        }

        $zipArchive = [System.IO.Compression.ZipFile]::OpenRead($tempZipPath)
        try {
            foreach ($entry in $zipArchive.Entries) {
                # Zip Slip Guard: Verify destination starts with staging directory
                $destinationPath = [System.IO.Path]::GetFullPath((Join-Path $tempExtractPath $entry.FullName))
                if (-not $destinationPath.StartsWith($canonicalExtractRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw "[komoyasb:bootstrap] Zip Slip path traversal attempt detected in entry: '$($entry.FullName)'."
                }

                if ([string]::IsNullOrEmpty($entry.Name)) {
                    # Directory entry
                    if (-not (Test-Path -LiteralPath $destinationPath)) {
                        New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
                    }
                } else {
                    $entryParent = [System.IO.Path]::GetDirectoryName($destinationPath)
                    if ($entryParent -and -not (Test-Path -LiteralPath $entryParent)) {
                        New-Item -ItemType Directory -Path $entryParent -Force | Out-Null
                    }
                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destinationPath, $true)
                }
            }
        }
        finally {
            $zipArchive.Dispose()
        }

        # GitHub zip archives contain a root subfolder like 'komoyasb-main'
        $extractedItems = Get-ChildItem -LiteralPath $tempExtractPath
        $innerFolder = $extractedItems | Where-Object { $_.PSIsContainer } | Select-Object -First 1

        if ($null -eq $innerFolder) {
            throw "[komoyasb:bootstrap] Extracted zip archive does not contain a valid root folder."
        }

        if (-not (Test-Path -LiteralPath $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }

        Write-Host "[komoyasb:bootstrap] Normalizing files into target directory: $InstallDir" -ForegroundColor Cyan
        $canonicalInstallRoot = [System.IO.Path]::GetFullPath($InstallDir)
        if (-not $canonicalInstallRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar.ToString())) {
            $canonicalInstallRoot += [System.IO.Path]::DirectorySeparatorChar
        }

        Get-ChildItem -LiteralPath $innerFolder.FullName | ForEach-Object {
            $destItem = [System.IO.Path]::GetFullPath((Join-Path $InstallDir $_.Name))
            if (-not $destItem.StartsWith($canonicalInstallRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "[komoyasb:bootstrap] Path traversal detected during staging normalization: '$($_.Name)'."
            }
            Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempZipPath) {
            Remove-Item -LiteralPath $tempZipPath -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $tempExtractPath) {
            Remove-Item -LiteralPath $tempExtractPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$installerScript = Join-Path $InstallDir "install.ps1"
if (-not (Test-Path -LiteralPath $installerScript)) {
    throw "[komoyasb:bootstrap] Entry script not found at expected location: $installerScript"
}

$forwardList = [System.Collections.Generic.List[string]]::new()
if ($ForwardArgs) {
    foreach ($arg in $ForwardArgs) {
        if (-not [string]::IsNullOrWhiteSpace($arg)) {
            $forwardList.Add([string]$arg)
        }
    }
}

if ($rootlessMode -and -not ($forwardList -contains "-NoAdmin")) {
    $forwardList.Add("-NoAdmin")
}

Write-Host "[komoyasb:bootstrap] Invoking installer: $installerScript" -ForegroundColor Green
if (@($forwardList).Count -gt 0) {
    Write-Host "[komoyasb:bootstrap] Forwarding arguments: $($forwardList -join ' ')" -ForegroundColor DarkGray
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$installerScript" @forwardList
}
else {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$installerScript"
}

if ($LASTEXITCODE -ne 0) {
    throw "[komoyasb:bootstrap] Installer execution failed with exit code $LASTEXITCODE."
}

Write-Host "[komoyasb:bootstrap] Execution completed." -ForegroundColor Green
