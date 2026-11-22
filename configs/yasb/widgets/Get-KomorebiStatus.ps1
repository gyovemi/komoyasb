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

$ErrorActionPreference = 'SilentlyContinue'

$komorebicCommand = Get-Command "komorebic.exe" -ErrorAction SilentlyContinue
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

try {
    $rawStateJson = & komorebic state 2>$null
    if ($rawStateJson) {
        $parsedState = $rawStateJson | ConvertFrom-Json
        $focusedMonitor = $parsedState.monitors.elements[$parsedState.monitors.focused]
        $focusedWorkspace = $focusedMonitor.workspaces.elements[$focusedMonitor.workspaces.focused]
        
        $layoutName = if ($focusedWorkspace.layout.Default) { $focusedWorkspace.layout.Default } else { "BSP" }
        $windowCount = $focusedWorkspace.containers.elements.Count

        [PSCustomObject]@{
            status = "online"
            layout = [string]$layoutName
            focused_index = [int]($focusedMonitor.workspaces.focused + 1)
            window_count = [int]$windowCount
            icon = "󱂬"
        } | ConvertTo-Json -Compress
        exit 0
    }
}
catch {
    # Ignored fallback
}

[PSCustomObject]@{
    status = "offline"
    layout = "N/A"
    focused_index = 0
    window_count = 0
    icon = "󰘳"
} | ConvertTo-Json -Compress
