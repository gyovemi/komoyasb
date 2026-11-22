<#
.SYNOPSIS
    Applies the desktop wallpaper using Win32 SystemParametersInfo SPI_SETDESKWALLPAPER.

.DESCRIPTION
    Zero-bloat, native Windows API wallpaper synchronizer.
    Configures wallpaper style (Fill, Fit, Stretch, Tile, Center, Span) via HKCU\Control Panel\Desktop
    and notifies Windows Shell/DWM immediately via SystemParametersInfoW.

.PARAMETER Path
    Path to the wallpaper image (PNG, JPG, BMP). Can be relative or absolute.

.PARAMETER Style
    Wallpaper fit style: Fill, Fit, Stretch, Tile, Center, Span. Default: Fill.

.PARAMETER DryRun
    Simulate registry and SystemParametersInfo execution without modifying system state.

.OUTPUTS
    None. Outputs status message to console.

.EXAMPLE
    .\sync-wallpaper.ps1 -Path "configs/polish/wallpapers/dark.png" -Style Fill

.EXAMPLE
    .\sync-wallpaper.ps1 -Style Center -DryRun

.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$Path = "",

    [Parameter(Mandatory = $false, Position = 1)]
    [ValidateSet("Fill", "Fit", "Stretch", "Tile", "Center", "Span")]
    [string]$Style = "Fill",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun) {
    $DryRun = $true
}

$coreHelpersDir = Join-Path $PSScriptRoot "lib"
$envModule = Join-Path $coreHelpersDir "Environment.psm1"
if (Test-Path -LiteralPath $envModule) {
    Import-Module $envModule -Force
}

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

# Win32 Native Invocation
# SystemParametersInfoW P/Invoke:
# Target OS: Windows NT 4.0+. Flags SPIF_UPDATEINIFILE | SPIF_SENDCHANGE persist wallpaper across reboots and broadcast WM_SETTINGCHANGE.
# Memory safety: string pvParam marshaled as Unicode null-terminated string.
$signature = @"
using System;
using System.Runtime.InteropServices;

public class NativeWallpaper {
    public const uint SPI_SETDESKWALLPAPER = 0x0014;
    public const uint SPIF_UPDATEINIFILE = 0x01;
    public const uint SPIF_SENDCHANGE = 0x02;

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SystemParametersInfo(
        uint uiAction,
        uint uiParam,
        string pvParam,
        uint fWinIni
    );
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativeWallpaper').Type) {
    Add-Type -TypeDefinition $signature -ErrorAction Stop
}

# Resolve Wallpaper Path
if ([string]::IsNullOrWhiteSpace($Path)) {
    # Default to dark.png relative to configs/polish/wallpapers
    $defaultPath = Join-Path $PSScriptRoot "..\configs\polish\wallpapers\dark.png"
    if (Test-Path $defaultPath) {
        $Path = $defaultPath
    } else {
        throw "No wallpaper path specified and default '$defaultPath' not found."
    }
}

# Resolve full path
if (-not [System.IO.Path]::IsPathRooted($Path)) {
    $resolvedPath = Join-Path (Get-Location).Path $Path
    if (-not (Test-Path $resolvedPath)) {
        $resolvedPath = Join-Path $PSScriptRoot $Path
    }
    $Path = $resolvedPath
}

if (-not (Test-Path $Path)) {
    throw "Wallpaper file does not exist: $Path"
}

$fullWallpaperPath = [System.IO.Path]::GetFullPath($Path)
Write-Verbose "Target wallpaper: $fullWallpaperPath (Style: $Style)"

# Map styles to Windows Registry:
# HKCU\Control Panel\Desktop
# WallpaperStyle:
#   0 = Center (TileWallpaper = 0) or Tile (TileWallpaper = 1)
#   2 = Stretch (TileWallpaper = 0)
#   6 = Fit (TileWallpaper = 0)
#  10 = Fill (TileWallpaper = 0)
#  22 = Span (TileWallpaper = 0)
$wallpaperStyle = "10"
$tileWallpaper = "0"

switch ($Style) {
    "Fill"    { $wallpaperStyle = "10"; $tileWallpaper = "0" }
    "Fit"     { $wallpaperStyle = "6";  $tileWallpaper = "0" }
    "Stretch" { $wallpaperStyle = "2";  $tileWallpaper = "0" }
    "Tile"    { $wallpaperStyle = "0";  $tileWallpaper = "1" }
    "Center"  { $wallpaperStyle = "0";  $tileWallpaper = "0" }
    "Span"    { $wallpaperStyle = "22"; $tileWallpaper = "0" }
}

if ($isDry -or $WhatIfPreference) {
    if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
        Invoke-SystemAction -ActionType "RegistryWrite" -Target "HKCU:\Control Panel\Desktop\WallpaperStyle" -Metadata @{
            Value = $wallpaperStyle
            Type = "String"
        }
        Invoke-SystemAction -ActionType "RegistryWrite" -Target "HKCU:\Control Panel\Desktop\TileWallpaper" -Metadata @{
            Value = $tileWallpaper
            Type = "String"
        }
        Invoke-SystemAction -ActionType "WallpaperApply" -Target $fullWallpaperPath -Metadata @{
            Style = $Style
            WallpaperStyle = $wallpaperStyle
            TileWallpaper = $tileWallpaper
        }
    }
    Write-Host "[DRYRUN] Set registry HKCU:\Control Panel\Desktop\WallpaperStyle = $wallpaperStyle" -ForegroundColor Cyan
    Write-Host "[DRYRUN] Set registry HKCU:\Control Panel\Desktop\TileWallpaper = $tileWallpaper" -ForegroundColor Cyan
    Write-Host "[DRYRUN] Invoke SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, '$fullWallpaperPath', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)" -ForegroundColor Cyan
    return
}

# Apply Registry Settings
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "WallpaperStyle" -Value $wallpaperStyle -Type String -Force
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "TileWallpaper" -Value $tileWallpaper -Type String -Force

# Invoke Win32 SystemParametersInfo
$flags = [NativeWallpaper]::SPIF_UPDATEINIFILE -bor [NativeWallpaper]::SPIF_SENDCHANGE
$result = [NativeWallpaper]::SystemParametersInfo([NativeWallpaper]::SPI_SETDESKWALLPAPER, 0, $fullWallpaperPath, $flags)

if (-not $result) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "SystemParametersInfo failed to apply wallpaper. Win32 Error: $err"
}

Write-Host "Successfully applied wallpaper: $fullWallpaperPath (Style: $Style)" -ForegroundColor Green
