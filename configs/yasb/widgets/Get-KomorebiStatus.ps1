<#
.SYNOPSIS
    Queries Komorebi IPC state to retrieve active layout and window counts.
.DESCRIPTION
    Runs `komorebic state` and outputs JSON metadata consumed by YASB CustomWidget.
.OUTPUTS
    [string] JSON payload representing window manager state (status, layout, focused_index, window_count, icon).
.EXAMPLE
    .\Get-KomorebiStatus.ps1
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    $komorebicCommand = $null
    try {
        $komorebicCommand = Get-Command "komorebic" -ErrorAction SilentlyContinue
        if (-not $komorebicCommand) {
            $komorebicCommand = Get-Command "komorebic.exe" -ErrorAction SilentlyContinue
        }
    } catch {
        $komorebicCommand = $null
    }

    if (-not $komorebicCommand) {
        [PSCustomObject]@{
            status = "offline"
            layout = "None"
            focused_index = 0
            window_count = 0
            icon = "󰘳"
        } | ConvertTo-Json -Compress
        exit 0
    }

    $rawStateJson = & komorebic state 2>$null
    if ($rawStateJson) {
        $parsedState = $rawStateJson | ConvertFrom-Json
        if ($parsedState -and $parsedState.PSObject.Properties['monitors']) {
            $monitors = $parsedState.monitors
            if ($monitors.PSObject.Properties['elements'] -and $monitors.PSObject.Properties['focused']) {
                $focusedIdx = [int]$monitors.focused
                $elements = $monitors.elements
                if ($elements -and $focusedIdx -lt @($elements).Count) {
                    $focusedMonitor = $elements[$focusedIdx]
                    if ($focusedMonitor -and $focusedMonitor.PSObject.Properties['workspaces']) {
                        $workspaces = $focusedMonitor.workspaces
                        if ($workspaces.PSObject.Properties['elements'] -and $workspaces.PSObject.Properties['focused']) {
                            $wsFocused = [int]$workspaces.focused
                            $wsElements = $workspaces.elements
                            if ($wsElements -and $wsFocused -lt @($wsElements).Count) {
                                $focusedWorkspace = $wsElements[$wsFocused]
                                $layoutName = "BSP"
                                if ($focusedWorkspace -and $focusedWorkspace.PSObject.Properties['layout'] -and $focusedWorkspace.layout -and $focusedWorkspace.layout.PSObject.Properties['Default'] -and $focusedWorkspace.layout.Default) {
                                    $layoutName = [string]$focusedWorkspace.layout.Default
                                }
                                $windowCount = 0
                                if ($focusedWorkspace -and $focusedWorkspace.PSObject.Properties['containers'] -and $focusedWorkspace.containers -and $focusedWorkspace.containers.PSObject.Properties['elements']) {
                                    $windowCount = @($focusedWorkspace.containers.elements).Count
                                }

                                [PSCustomObject]@{
                                    status = "online"
                                    layout = [string]$layoutName
                                    focused_index = [int]($wsFocused + 1)
                                    window_count = [int]$windowCount
                                    icon = "󱂬"
                                } | ConvertTo-Json -Compress
                                exit 0
                            }
                        }
                    }
                }
            }
        }
    }
} catch {
    # Handled fallback below
}

[PSCustomObject]@{
    status = "offline"
    layout = "N/A"
    focused_index = 0
    window_count = 0
    icon = "󰘳"
} | ConvertTo-Json -Compress
