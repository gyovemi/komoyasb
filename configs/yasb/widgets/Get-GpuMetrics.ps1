<#
.SYNOPSIS
    Queries Windows GPU metrics (Nvidia, AMD, or Intel) and formats for YASB CustomWidget.
.DESCRIPTION
    Attempts to read GPU utilization and temperature using nvidia-smi if available,
    or falls back to WMI/Performance counters. Outputs formatted JSON or string for YASB.
.PARAMETER Format
    "json" or "string". Defaults to "json".
.PARAMETER IntervalMs
    Polling interval configured in YASB for throttling cache evaluation.
.PARAMETER SkipIfThrottled
    Switch to bypass counter query if performance profile enforces throttling.
.OUTPUTS
    [string] JSON payload or formatted status string for YASB bar rendering.
.EXAMPLE
    .\Get-GpuMetrics.ps1 -Format json
.EXAMPLE
    .\Get-GpuMetrics.ps1 -Format string
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding()]
param(
    [ValidateSet("json", "string")]
    [string]$Format = "json",

    [Parameter(Mandatory = $false)]
    [int]$IntervalMs = 0,

    [Parameter(Mandatory = $false)]
    [switch]$SkipIfThrottled
)

$ErrorActionPreference = 'SilentlyContinue'

# If SkipIfThrottled or IntervalMs >= 30000ms (gaming/ultra-low profile), check cache or skip heavy polling
$cacheFile = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb_gpu_metrics_cache.json"
$currentTimeUtc = [DateTime]::UtcNow

# Check active performance profile if not explicitly passed
$activePerformanceProfile = "balanced"
$perfMarkerPath = Join-Path $PSScriptRoot "..\..\..\themes\.current_perf"
if (Test-Path -LiteralPath $perfMarkerPath) {
    try {
        $activePerformanceProfile = (Get-Content -Path $perfMarkerPath -Raw -ErrorAction SilentlyContinue).Trim()
    } catch {}
}

# In gaming profile or when IntervalMs >= 30000, avoid frequent expensive counter calls
if ($SkipIfThrottled -or $IntervalMs -ge 30000 -or $activePerformanceProfile -eq "gaming") {
    if (Test-Path -LiteralPath $cacheFile) {
        try {
            $cacheContent = Get-Content -LiteralPath $cacheFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
            if ($cacheContent -and $cacheContent.Timestamp) {
                $cachedTime = [DateTime]::Parse($cacheContent.Timestamp)
                $maxCacheAgeSec = if ($IntervalMs -ge 30000) { [Math]::Round($IntervalMs / 1000.0) } else { 30 }
                if (($currentTimeUtc - $cachedTime).TotalSeconds -lt $maxCacheAgeSec) {
                    if ($Format -eq "json") {
                        $cachedResult = [PSCustomObject]@{
                            load = [int]$cacheContent.load
                            temp = [int]$cacheContent.temp
                            name = [string]$cacheContent.name
                            icon = [char]0xF108
                            cached = $true
                        }
                        $cachedResult | ConvertTo-Json -Compress
                        return
                    } else {
                        Write-Output "󰢮 $($cacheContent.load)% ($($cacheContent.temp)°C)"
                        return
                    }
                }
            }
        } catch {}
    }
}

$gpuLoadPercentage = 0
$gpuTemperatureCelsius = 0
$gpuDeviceName = "GPU"

# Try nvidia-smi first
$nvidiaSmi = Get-Command "nvidia-smi.exe" -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
    $smiOutput = & nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,name --format=csv,noheader,nounits 2>$null
    if ($smiOutput) {
        $outputParts = $smiOutput -split ','
        if (@($outputParts).Count -ge 2) {
            $gpuLoadPercentage = [int]($outputParts[0].Trim())
            $gpuTemperatureCelsius = [int]($outputParts[1].Trim())
            if (@($outputParts).Count -ge 3) {
                $gpuDeviceName = $outputParts[2].Trim()
            }
        }
    }
}
else {
    # Fallback to WMI / Performance Counter for generic GPU 3D engine utilization
    try {
        $gpuPerfCounter = Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue
        if ($gpuPerfCounter -and $gpuPerfCounter.CounterSamples) {
            $validSamples = $gpuPerfCounter.CounterSamples | Where-Object { $_.CookedValue -gt 0 }
            if ($validSamples) {
                $maxUtilization = ($validSamples | Measure-Object -Property CookedValue -Maximum).Maximum
                $gpuLoadPercentage = [math]::Round($maxUtilization)
            }
        }
    }
    catch {
        $gpuLoadPercentage = 0
    }
}

# Cache the latest metric result
try {
    $cachePayload = [PSCustomObject]@{
        load = $gpuLoadPercentage
        temp = $gpuTemperatureCelsius
        name = $gpuDeviceName
        Timestamp = $currentTimeUtc.ToString("o")
    }
    $cachePayload | ConvertTo-Json -Compress | Set-Content -LiteralPath $cacheFile -Force -ErrorAction SilentlyContinue
} catch {}

if ($Format -eq "json") {
    $formattedResult = [PSCustomObject]@{
        load = $gpuLoadPercentage
        temp = $gpuTemperatureCelsius
        name = $gpuDeviceName
        icon = [char]0xF108 # Nerd font display icon
    }
    $formattedResult | ConvertTo-Json -Compress
}
else {
    Write-Output "󰢮 ${gpuLoadPercentage}% (${gpuTemperatureCelsius}°C)"
}
