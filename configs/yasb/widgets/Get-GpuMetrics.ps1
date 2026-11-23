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

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    # If SkipIfThrottled or IntervalMs >= 30000ms (gaming/ultra-low profile), check cache or skip heavy polling
    $cacheFile = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb_gpu_metrics_cache.json"
    $currentTimeUtc = [DateTime]::UtcNow

    # Check active performance profile if not explicitly passed
    $activePerformanceProfile = "balanced"
    $perfMarkerPath = Join-Path $PSScriptRoot "..\..\..\themes\.current_perf"
    if (Test-Path -LiteralPath $perfMarkerPath) {
        try {
            $markerRaw = Get-Content -LiteralPath $perfMarkerPath -Raw -ErrorAction SilentlyContinue
            if ($markerRaw) {
                $activePerformanceProfile = $markerRaw.Trim()
            }
        } catch {}
    }

    # In gaming profile or when IntervalMs >= 30000, avoid frequent expensive counter calls
    if ($SkipIfThrottled -or $IntervalMs -ge 30000 -or $activePerformanceProfile -eq "gaming") {
        if (Test-Path -LiteralPath $cacheFile) {
            try {
                $cacheRaw = Get-Content -LiteralPath $cacheFile -Raw -ErrorAction SilentlyContinue
                if ($cacheRaw) {
                    $cacheContent = $cacheRaw | ConvertFrom-Json
                    if ($cacheContent -and $cacheContent.PSObject.Properties['Timestamp'] -and $cacheContent.Timestamp) {
                        $cachedTime = [DateTime]::Parse($cacheContent.Timestamp)
                        $maxCacheAgeSec = if ($IntervalMs -ge 30000) { [Math]::Round($IntervalMs / 1000.0) } else { 30 }
                        if (($currentTimeUtc - $cachedTime).TotalSeconds -lt $maxCacheAgeSec) {
                            $cLoad = if ($cacheContent.PSObject.Properties['load']) { [int]$cacheContent.load } else { 0 }
                            $cTemp = if ($cacheContent.PSObject.Properties['temp']) { [int]$cacheContent.temp } else { 0 }
                            $cName = if ($cacheContent.PSObject.Properties['name']) { [string]$cacheContent.name } else { "GPU" }
                            if ($Format -eq "json") {
                                $cachedResult = [PSCustomObject]@{
                                    load = $cLoad
                                    temp = $cTemp
                                    name = $cName
                                    icon = [char]0xF108
                                    cached = $true
                                }
                                $cachedResult | ConvertTo-Json -Compress
                                return
                            } else {
                                Write-Output "󰢮 ${cLoad}% (${cTemp}°C)"
                                return
                            }
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
    $nvidiaSmi = $null
    try {
        $nvidiaSmi = Get-Command "nvidia-smi.exe" -ErrorAction SilentlyContinue
    } catch {}

    if ($nvidiaSmi) {
        try {
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
        } catch {}
    }
    else {
        # Fallback to WMI / Performance Counter for generic GPU 3D engine utilization
        try {
            $gpuPerfCounter = Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue
            if ($gpuPerfCounter -and $gpuPerfCounter.PSObject.Properties['CounterSamples'] -and $gpuPerfCounter.CounterSamples) {
                $validSamples = $gpuPerfCounter.CounterSamples | Where-Object { $_.CookedValue -gt 0 }
                if ($validSamples) {
                    $maxUtilization = ($validSamples | Measure-Object -Property CookedValue -Maximum).Maximum
                    if ($null -ne $maxUtilization) {
                        $gpuLoadPercentage = [math]::Round($maxUtilization)
                    }
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
} catch {
    if ($Format -eq "json") {
        [PSCustomObject]@{
            load = 0
            temp = 0
            name = "GPU"
            icon = [char]0xF108
        } | ConvertTo-Json -Compress
    } else {
        Write-Output "󰢮 0% (0°C)"
    }
}
