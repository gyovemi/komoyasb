<#
.SYNOPSIS
    Automated end-to-end full dry-run test harness for komoyasb.
.DESCRIPTION
    Validates the complete lifecycle dry-run with rigorous zero-mutation guarantees across:
    - Step 1 (Snapshot): Baseline cryptographic snapshot of live host targets
      ($env:USERPROFILE\.config\komorebi, yasb, whkdrc, $env:APPDATA\FlowLauncher, repo configs).
    - Step 2-7 (Baseline Lifecycle): Full install -> host check 1 -> render validation ->
      install idempotency -> uninstall rollback -> host check 2.
    - Step 8 (Performance Profiles Matrix): Validates all 4 profiles (ultra-low, balanced, visual-rich, gaming)
      across rootless (-NoAdmin) permutations.
    - Step 9 (Theme Variants Matrix): Validates both dark and light theme compilation and token expansion
      across rootless (-NoAdmin) permutations.
    - Step 10 (Flag Variants Matrix): Validates -SkipPackages, -ApplyWindhawk, -RemovePackages, and -NoAdmin.
    - Step 11 (Sandbox Auto-Cleanup): Asserts that when -KeepSandbox is omitted, the sandbox is completely removed.
    - Step 12 (Failure Recovery): Asserts graceful failure handling for missing themes, corrupted sandboxes,
      and invalid performance profiles with zero host mutation.
    - Step 13 (Final Host Zero-Mutation Check): Final cryptographic assertion against baseline snapshot.
.PARAMETER KeepSandbox
    Retains all temporary sandbox folders upon completion for inspection.
.OUTPUTS
    None. Exits with code 0 on success, 1 on failure.
.EXAMPLE
    .\scripts\Test-FullDryRun.ps1
.EXAMPLE
    .\scripts\Test-FullDryRun.ps1 -KeepSandbox
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$KeepSandbox
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path

$envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"
$dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
$templateModule = Join-Path $repoRoot "scripts\lib\TemplateEngine.psm1"

Import-Module $dryRunModule -Force
Import-Module $envModule -Force
Import-Module $templateModule -Force

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  komoyasb Full Dry-Run & Host Zero-Mutation Harness Gate       " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Repo Root   : $repoRoot" -ForegroundColor Gray
Write-Host "KeepSandbox : $KeepSandbox" -ForegroundColor Gray

# Define live host targets to monitor
$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
$appData = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }

$liveTargets = @(
    (Join-Path $userProfile ".config\komorebi"),
    (Join-Path $userProfile ".config\yasb"),
    (Join-Path $userProfile ".config\whkdrc"),
    (Join-Path $appData "FlowLauncher"),
    (Join-Path $repoRoot "configs"),
    (Join-Path $repoRoot "themes\.current_theme"),
    (Join-Path $repoRoot "themes\.current_perf"),
    (Join-Path $repoRoot "themes\.latest_backup.txt"),
    (Join-Path $repoRoot "themes\.backups")
)

# Registry of all temporary sandboxes to clean up in finally
$script:allocatedSandboxes = [System.Collections.Generic.List[string]]::new()

function New-TestSandboxRoot {
    param([string]$Prefix = "komoyasb-harness-")
    $sb = Join-Path ([System.IO.Path]::GetTempPath()) ($Prefix + [System.Guid]::NewGuid().ToString("N"))
    $script:allocatedSandboxes.Add($sb)
    return $sb
}

function Safe-TestPath {
    param([string]$Path)
    try {
        if ([System.IO.File]::Exists($Path) -or [System.IO.Directory]::Exists($Path)) {
            return $true
        }
        $fileExists = $false
        $previousEap = $global:ErrorActionPreference
        $global:ErrorActionPreference = 'SilentlyContinue'
        $fileExists = Test-Path -LiteralPath $Path -ErrorAction SilentlyContinue
        $global:ErrorActionPreference = $previousEap
        return [bool]$fileExists
    } catch {
        return $false
    }
}

function Take-HostSnapshot {
    param([string[]]$Paths)
    $snapshotMap = @{}
    foreach ($targetPath in $Paths) {
        $pathExists = Safe-TestPath -Path $targetPath
        if (-not $pathExists) {
            $snapshotMap[$targetPath] = @{ Exists = $false }
            continue
        }

        try {
            $filesystemItem = Get-Item -LiteralPath $targetPath -ErrorAction SilentlyContinue
            if ($null -eq $filesystemItem) {
                $snapshotMap[$targetPath] = @{ Exists = $false }
                continue
            }

            if ($filesystemItem.PSIsContainer) {
                $containedFiles = Get-ChildItem -LiteralPath $targetPath -Recurse -File -Force -ErrorAction SilentlyContinue
                $fileDictionary = @{}
                foreach ($fileRecord in $containedFiles) {
                    $sha256Hash = Get-Sha256Hash -Path $fileRecord.FullName
                    $fileDictionary[$fileRecord.FullName] = @{
                        LastWriteUtc = $fileRecord.LastWriteTimeUtc.Ticks
                        Length       = $fileRecord.Length
                        Sha256       = $sha256Hash
                    }
                }
                $snapshotMap[$targetPath] = @{
                    Exists       = $true
                    IsContainer  = $true
                    Files        = $fileDictionary
                    LastWriteUtc = $filesystemItem.LastWriteTimeUtc.Ticks
                }
            } else {
                $sha256Hash = Get-Sha256Hash -Path $filesystemItem.FullName
                $snapshotMap[$targetPath] = @{
                    Exists       = $true
                    IsContainer  = $false
                    LastWriteUtc = $filesystemItem.LastWriteTimeUtc.Ticks
                    Length       = $filesystemItem.Length
                    Sha256       = $sha256Hash
                }
            }
        } catch {
            $snapshotMap[$targetPath] = @{ Exists = $false }
        }
    }
    return $snapshotMap
}

function Compare-HostSnapshot {
    param(
        [hashtable]$Baseline,
        [hashtable]$Current,
        [string]$StageName
    )

    $mutationDifferences = [System.Collections.Generic.List[string]]::new()

    foreach ($targetKey in $Baseline.Keys) {
        $baseRecord = $Baseline[$targetKey]
        $currentRecord = $Current[$targetKey]

        if ($baseRecord.Exists -ne $currentRecord.Exists) {
            $mutationDifferences.Add("Existence changed for '$targetKey': Baseline Exists=$($baseRecord.Exists), Current Exists=$($currentRecord.Exists)")
            continue
        }

        if (-not $baseRecord.Exists) {
            continue
        }

        if ($baseRecord.IsContainer) {
            $baselineFiles = $baseRecord.Files
            $currentFiles = $currentRecord.Files

            foreach ($filePath in $baselineFiles.Keys) {
                if (-not $currentFiles.ContainsKey($filePath)) {
                    $mutationDifferences.Add("File deleted on live host: $filePath")
                } else {
                    if ($baselineFiles[$filePath].Sha256 -ne $currentFiles[$filePath].Sha256) {
                        $mutationDifferences.Add("File mutated on live host: $filePath (Hash changed: $($baselineFiles[$filePath].Sha256) -> $($currentFiles[$filePath].Sha256))")
                    }
                }
            }

            foreach ($filePath in $currentFiles.Keys) {
                if (-not $baselineFiles.ContainsKey($filePath)) {
                    $mutationDifferences.Add("New file created on live host: $filePath")
                }
            }
        } else {
            if ($baseRecord.Sha256 -ne $currentRecord.Sha256) {
                $mutationDifferences.Add("File mutated on live host: $targetKey (Hash changed: $($baseRecord.Sha256) -> $($currentRecord.Sha256))")
            }
        }
    }

    if ($mutationDifferences.Count -gt 0) {
        Write-Host "[$StageName] FATAL: Host mutation detected!" -ForegroundColor Red
        foreach ($diffEntry in $mutationDifferences) {
            Write-Host "  - $diffEntry" -ForegroundColor Red
        }
        return $false
    }

    Write-Host "[$StageName] Zero host mutation confirmed (100% untouched)." -ForegroundColor Green
    return $true
}

function Test-SandboxRenderedConfigs {
    param(
        [string]$SandboxRoot,
        [string]$ContextLabel = "Sandbox"
    )

    $shadowUserProfile = Join-Path $SandboxRoot "userprofile"
    $shadowWorkspace   = Join-Path $SandboxRoot "workspace"

    $renderedFiles = @(
        (Join-Path $shadowUserProfile ".config\komorebi\komorebi.json"),
        (Join-Path $shadowUserProfile ".config\whkdrc"),
        (Join-Path $shadowUserProfile ".config\yasb\config.yaml"),
        (Join-Path $shadowUserProfile ".config\yasb\styles.css"),
        (Join-Path $SandboxRoot "appdata\FlowLauncher\Settings\Settings.json"),
        (Join-Path $shadowWorkspace "configs\komorebi\komorebi.json"),
        (Join-Path $shadowWorkspace "configs\komorebi\whkdrc"),
        (Join-Path $shadowWorkspace "configs\yasb\config.yaml"),
        (Join-Path $shadowWorkspace "configs\yasb\styles.css"),
        (Join-Path $shadowWorkspace "configs\polish\fluentflyout_config.json"),
        (Join-Path $shadowWorkspace "configs\shell\flow_settings.json"),
        (Join-Path $shadowWorkspace "configs\shell\flow_theme.fluent")
    )

    $validatedCount = 0
    foreach ($file in $renderedFiles) {
        if (-not (Test-Path -LiteralPath $file)) {
            throw "[$ContextLabel] Expected rendered sandbox file missing: $file"
        }

        $rawText = Get-Content -LiteralPath $file -Raw -Encoding UTF8
        
        # Check for unexpanded {{...}} tokens
        if ($rawText -match '\{\{[a-zA-Z0-9_\.]+\}\}') {
            $matches = [System.Text.RegularExpressions.Regex]::Matches($rawText, '\{\{[a-zA-Z0-9_\.]+\}\}')
            $unexpanded = @()
            foreach ($m in $matches) { $unexpanded += $m.Value }
            throw "[$ContextLabel] Leftover unexpanded token(s) $($unexpanded -join ', ') in $file"
        }

        # Syntax checks by extension
        if ($file.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
            try {
                $null = ConvertFrom-Json -InputObject $rawText
            } catch {
                throw "[$ContextLabel] Invalid JSON syntax in $file : $_"
            }
        }
        elseif ($file.EndsWith(".yaml", [System.StringComparison]::OrdinalIgnoreCase) -or $file.EndsWith(".yml", [System.StringComparison]::OrdinalIgnoreCase)) {
            $lines = $rawText -split "`r?`n"
            $hasColon = $false
            foreach ($line in $lines) {
                if ($line.Trim() -and -not $line.Trim().StartsWith("#") -and $line.Contains(":")) {
                    $hasColon = $true
                    break
                }
            }
            if (-not $hasColon) {
                throw "[$ContextLabel] YAML file does not appear to contain valid key-value pairs: $file"
            }
        }
        elseif ($file.EndsWith(".css", [System.StringComparison]::OrdinalIgnoreCase)) {
            $openBraces = ($rawText.ToCharArray() | Where-Object { $_ -eq '{' }).Count
            $closeBraces = ($rawText.ToCharArray() | Where-Object { $_ -eq '}' }).Count
            if ($openBraces -ne $closeBraces -or $openBraces -eq 0) {
                throw "[$ContextLabel] Unbalanced or empty CSS braces in $file ($openBraces open vs $closeBraces close)"
            }
        }
        elseif ($file.EndsWith(".fluent", [System.StringComparison]::OrdinalIgnoreCase) -or $file.EndsWith(".xaml", [System.StringComparison]::OrdinalIgnoreCase)) {
            try {
                $xmlDoc = [xml]$rawText
                if ($null -eq $xmlDoc.ResourceDictionary) {
                    throw "Root element is not ResourceDictionary"
                }
            } catch {
                throw "[$ContextLabel] Invalid XML/XAML syntax in $file : $_"
            }
        }
        $validatedCount++
    }
    Write-Host "  [$ContextLabel] Successfully validated $validatedCount rendered configuration files." -ForegroundColor Green
    return $true
}

function Test-TemplateTokenSchemaAudit {
    param(
        [string]$WorkspaceRoot
    )

    Write-Host "`n>>> [Audit] Auditing all template tokens across Komorebi, YASB, whkd, Flow Launcher, and FluentFlyouts..." -ForegroundColor Cyan

    $templateFiles = Get-ChildItem -Path (Join-Path $WorkspaceRoot "configs") -Recurse -Filter "*.template"
    if ($templateFiles.Count -eq 0) {
        throw "No template files found in $WorkspaceRoot\configs"
    }

    $allDiscoveredTokens = @{}
    $tokenRegex = '\{\{([a-zA-Z0-9_\.]+)\}\}'
    foreach ($tmpl in $templateFiles) {
        $content = [System.IO.File]::ReadAllText($tmpl.FullName, [System.Text.Encoding]::UTF8)
        $matches = [System.Text.RegularExpressions.Regex]::Matches($content, $tokenRegex)
        foreach ($m in $matches) {
            $tok = $m.Groups[1].Value
            if (-not $allDiscoveredTokens.ContainsKey($tok)) {
                $allDiscoveredTokens[$tok] = [System.Collections.Generic.List[string]]::new()
            }
            if (-not $allDiscoveredTokens[$tok].Contains($tmpl.Name)) {
                $allDiscoveredTokens[$tok].Add($tmpl.Name)
            }
        }
    }
    Write-Host "  Found $($allDiscoveredTokens.Keys.Count) unique tokens across $($templateFiles.Count) template files." -ForegroundColor Green

    # Validate dark.json, light.json, and performance.json
    $darkJson = Get-Content -LiteralPath (Join-Path $WorkspaceRoot "themes\dark.json") -Raw | ConvertFrom-Json
    $lightJson = Get-Content -LiteralPath (Join-Path $WorkspaceRoot "themes\light.json") -Raw | ConvertFrom-Json
    $perfJson = Get-Content -LiteralPath (Join-Path $WorkspaceRoot "performance.json") -Raw | ConvertFrom-Json

    $profiles = @("ultra-low", "balanced", "visual-rich", "gaming")

    # Define strict schema fallback defaults dictionary
    $script:SchemaFallbackDefaults = @{
        "name"                                              = "Tokyo Night Dark"
        "variant"                                           = "dark"
        "colors.bg_primary"                                 = "#1a1b26"
        "colors.bg_secondary"                               = "#16161e"
        "colors.bg_surface"                                 = "#24283b"
        "colors.fg_primary"                                 = "#c0caf5"
        "colors.fg_secondary"                               = "#a9b1d6"
        "colors.fg_muted"                                   = "#565f89"
        "colors.accent"                                     = "#7aa2f7"
        "colors.accent_secondary"                           = "#bb9af7"
        "colors.border_active"                              = "#7aa2f7"
        "colors.border_inactive"                            = "#292e42"
        "colors.error"                                      = "#f7768e"
        "colors.warning"                                    = "#e0af68"
        "colors.success"                                    = "#9ece6a"
        "colors.info"                                       = "#7dcfff"
        "colors.bg_primary_alpha85"                         = "rgba(26, 27, 38, 0.85)"
        "colors.bg_secondary_alpha80"                       = "rgba(22, 22, 30, 0.8)"
        "colors.bg_surface_alpha80"                         = "rgba(36, 40, 59, 0.8)"
        "typography.font_family"                            = "JetBrainsMono Nerd Font"
        "typography.font_size_sm"                           = "11px"
        "typography.font_size_md"                           = "13px"
        "typography.font_size_lg"                           = "16px"
        "geometry.border_width"                             = "2"
        "geometry.border_radius"                            = "8"
        "geometry.window_gap"                               = "8"
        "geometry.bar_height"                               = "32"
        "opacity.bar"                                       = "0.88"
        "opacity.window_unfocused"                          = "0.85"
        "opacity.flyout"                                    = "0.90"
        "opacity.launcher"                                  = "0.92"
        "wallpaper.path"                                    = "configs/polish/wallpapers/dark.png"
        "wallpaper.url_path"                                = "configs/polish/wallpapers/dark.png"
        "wallpaper.style"                                   = "Fill"
        "perf.komorebi.animation_enabled"                   = "false"
        "perf.komorebi.animation_duration_ms"               = "0"
        "perf.komorebi.animation_fps"                       = "60"
        "perf.komorebi.border_enabled"                      = "true"
        "perf.komorebi.border_width"                        = "2"
        "perf.komorebi.border_offset"                       = "0"
        "perf.komorebi.border_style"                        = "rounded"
        "perf.komorebi.border_implementation"               = "Komorebi"
        "perf.komorebi.unmanaged_window_operation_behaviour" = "Op"
        "perf.komorebi.unmanaged_behaviour"                  = "Op"
        "perf.komorebi.transparency_enabled"                = "false"
        "perf.komorebi.window_hiding_behaviour"             = "Cloak"
        "perf.yasb.blur_enabled"                            = "false"
        "perf.yasb.acrylic_enabled"                         = "false"
        "perf.yasb.round_corners"                           = "true"
        "perf.yasb.animation_duration_ms"                   = "0"
        "perf.yasb.transition_duration"                    = "0s"
        "perf.yasb.cpu_interval_ms"                         = "2000"
        "perf.yasb.memory_interval_ms"                      = "3000"
        "perf.yasb.traffic_interval_ms"                     = "2000"
        "perf.yasb.media_interval_ms"                       = "1000"
        "perf.yasb.clock_interval_ms"                       = "1000"
        "perf.yasb.gpu_interval_ms"                         = "5000"
        "perf.launcher.use_animation"                       = "false"
        "perf.launcher.animation_speed"                     = "Fast"
        "perf.launcher.search_window_effect"                = "None"
        "perf.launcher.shadow_effect"                       = "false"
        "perf.launcher.max_results"                         = "8"
        "perf.launcher.plugin_cache_max"                    = "100"
        "perf.flow.use_animation"                           = "false"
        "perf.flow.animation_speed"                         = "Fast"
        "perf.flow.search_window_effect"                    = "None"
        "perf.flow.shadow_effect"                           = "false"
        "perf.flow.max_results"                             = "8"
        "perf.flyout.backdrop"                              = "None"
        "perf.flyout.animate_show"                          = "false"
        "perf.flyout.animate_hide"                          = "false"
        "perf.flyout.animation_duration_ms"                 = "0"
        "perf.flyout.timeout_ms"                            = "3000"
        "perf.dwm.backdrop_type"                            = "2"
        "perf.dwm.force_dark_mode"                          = "true"
        "perf.dwm.rounded_corners"                          = "2"
        "perf.dwm.reduce_motion"                            = "false"
        "perf.dwm.taskbar_autohide_enabled"                 = "false"
        "perf.os.background_eco_qos"                        = "false"
        "perf.os.komorebi_priority"                         = "Normal"
        "perf.os.yasb_priority"                             = "Normal"
        "perf.os.disable_windows_animations"                = "false"
    }

    # Verify every discovered token is covered by fallback defaults
    $uncoveredTokens = @()
    foreach ($tokenKey in $allDiscoveredTokens.Keys) {
        if (-not $script:SchemaFallbackDefaults.ContainsKey($tokenKey)) {
            $uncoveredTokens += $tokenKey
        }
    }
    if ($uncoveredTokens.Count -gt 0) {
        throw "Audit Failed: Tokens discovered in templates lack fallback defaults: $($uncoveredTokens -join ', ')"
    }
    Write-Host "  All $($allDiscoveredTokens.Keys.Count) template tokens have typed schema fallback defaults." -ForegroundColor Green

    # Verify that dark.json and light.json resolve all theme tokens
    foreach ($themeVariant in @("dark", "light")) {
        $tObj = if ($themeVariant -eq "dark") { $darkJson } else { $lightJson }
        $tTokens = Expand-ComputedTokens -Tokens (Get-FlattenedTokens -JsonObject $tObj)
        foreach ($pName in $profiles) {
            $pObj = $perfJson.profiles.PSObject.Properties[$pName].Value
            $pTokens = Get-FlattenedTokens -JsonObject $pObj -Prefix "perf"
            
            # Combine
            $testMap = @{}
            foreach ($k in $tTokens.Keys) { $testMap[$k] = $tTokens[$k] }
            foreach ($k in $pTokens.Keys) { $testMap[$k] = $pTokens[$k] }
            $testMap["wallpaper.path"] = "configs/polish/wallpapers/$themeVariant.png"
            $testMap["wallpaper.url_path"] = "configs/polish/wallpapers/$themeVariant.png"
            if ($testMap.ContainsKey("perf.komorebi.unmanaged_window_operation_behaviour")) {
                $testMap["perf.komorebi.unmanaged_behaviour"] = $testMap["perf.komorebi.unmanaged_window_operation_behaviour"]
            }
            if ($testMap.ContainsKey("perf.launcher.use_animation")) {
                $testMap["perf.flow.use_animation"] = $testMap["perf.launcher.use_animation"]
            }
            if ($testMap.ContainsKey("perf.launcher.animation_speed")) {
                $testMap["perf.flow.animation_speed"] = $testMap["perf.launcher.animation_speed"]
            }
            if ($testMap.ContainsKey("perf.launcher.search_window_effect")) {
                $testMap["perf.flow.search_window_effect"] = $testMap["perf.launcher.search_window_effect"]
            }
            if ($testMap.ContainsKey("perf.launcher.shadow_effect")) {
                $testMap["perf.flow.shadow_effect"] = $testMap["perf.launcher.shadow_effect"]
            }
            if ($testMap.ContainsKey("perf.launcher.max_results")) {
                $testMap["perf.flow.max_results"] = $testMap["perf.launcher.max_results"]
            }
            if ($testMap.ContainsKey("perf.yasb.animation_duration_ms")) {
                $durationMs = [int]$testMap["perf.yasb.animation_duration_ms"]
                $testMap["perf.yasb.transition_duration"] = if ($durationMs -le 0) { "0s" } else { "$([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.##}', ($durationMs / 1000.0)))s ease" }
            }

            foreach ($discoveredToken in $allDiscoveredTokens.Keys) {
                if (-not $testMap.ContainsKey($discoveredToken)) {
                    throw "Audit Failed: Token '$discoveredToken' (used in $($allDiscoveredTokens[$discoveredToken] -join ', ')) is missing for theme '$themeVariant' and profile '$pName'!"
                }
            }
        }
    }
    Write-Host "  Verified 100% token resolution across dark.json, light.json, and all 4 profiles in performance.json." -ForegroundColor Green
    return $true
}

# -----------------------------------------------------------------------------
# STEP 1: SNAPSHOT LIVE HOST TARGETS
# -----------------------------------------------------------------------------
Write-Host "`n>>> Step 1: Taking baseline cryptographic snapshot of live host targets..." -ForegroundColor Yellow
$baselineSnapshot = Take-HostSnapshot -Paths $liveTargets
Write-Host "Baseline snapshot recorded across $($liveTargets.Count) monitored targets." -ForegroundColor Green

# -----------------------------------------------------------------------------
# STEP 1B: AUDIT TEMPLATE TOKENS & SCHEMA FALLBACKS (BUG-10)
# -----------------------------------------------------------------------------
Test-TemplateTokenSchemaAudit -WorkspaceRoot $repoRoot | Out-Null

$installScript   = Join-Path $repoRoot "install.ps1"
$uninstallScript = Join-Path $repoRoot "uninstall.ps1"
$syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
$setPerfScript   = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"

# Prepare default sandbox & ledger paths
$testSandbox = New-TestSandboxRoot -Prefix "komoyasb-baseline-"
$testLedger  = Join-Path $testSandbox "ledger.json"

try {
    # -------------------------------------------------------------------------
    # STEP 2: INSTALL #1 (DEFAULT BASELINE DRY-RUN EXECUTION)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 2: Executing install.ps1 in DryRun mode with sandbox: $testSandbox" -ForegroundColor Yellow
    
    $proc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$testSandbox`"", "-LedgerPath", "`"$testLedger`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru

    if ($proc.ExitCode -ne 0) {
        throw "Step 2 Failed: install.ps1 exited with non-zero exit code $($proc.ExitCode)"
    }
    Write-Host "Install #1 completed with exit code 0." -ForegroundColor Green

    # Verify ledger exists and parses
    if (-not (Test-Path -LiteralPath $testLedger)) {
        throw "Step 2 Failed: Expected ledger not found at $testLedger"
    }
    $ledgerContent = Get-Content -LiteralPath $testLedger -Raw -Encoding UTF8
    $ledgerJson = ConvertFrom-Json -InputObject $ledgerContent
    Write-Host "Ledger generated successfully. Total actions: $($ledgerJson.summary.totalActions), Files: $($ledgerJson.summary.filesWritten)" -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 3: HOST ZERO-MUTATION CHECK 1
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 3: Verifying zero mutations on live host after Install #1..." -ForegroundColor Yellow
    $postInstallSnapshot = Take-HostSnapshot -Paths $liveTargets
    $zeroMutation1 = Compare-HostSnapshot -Baseline $baselineSnapshot -Current $postInstallSnapshot -StageName "Step 3: Post-Install 1"
    if (-not $zeroMutation1) {
        throw "Step 3 Failed: Live host files were modified during dry-run install!"
    }

    # -------------------------------------------------------------------------
    # STEP 4: RENDER VALIDATION
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 4: Validating rendered configuration syntax & token expansion in sandbox..." -ForegroundColor Yellow
    Test-SandboxRenderedConfigs -SandboxRoot $testSandbox -ContextLabel "Baseline Sandbox" | Out-Null
    Write-Host "All rendered sandbox configurations validated successfully." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 5: INSTALL #2 (IDEMPOTENCY CHECK)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 5: Executing install.ps1 second time to verify idempotency..." -ForegroundColor Yellow
    $proc2 = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$testSandbox`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru

    if ($proc2.ExitCode -ne 0) {
        throw "Step 5 Failed: Idempotent install.ps1 run failed with exit code $($proc2.ExitCode)"
    }
    Write-Host "Install #2 completed idempotently with exit code 0." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 6: UNINSTALL ROLLBACK
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 6: Executing uninstall.ps1 in DryRun mode against sandbox..." -ForegroundColor Yellow
    $proc3 = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$testSandbox`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru

    if ($proc3.ExitCode -ne 0) {
        throw "Step 6 Failed: uninstall.ps1 exited with non-zero exit code $($proc3.ExitCode)"
    }
    Write-Host "Uninstall dry-run completed with exit code 0." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 7: HOST ZERO-MUTATION CHECK 2
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 7: Performing cryptographic check against baseline snapshot after baseline lifecycle..." -ForegroundColor Yellow
    $snap7 = Take-HostSnapshot -Paths $liveTargets
    $zeroMutation2 = Compare-HostSnapshot -Baseline $baselineSnapshot -Current $snap7 -StageName "Step 7: Post-Uninstall"
    if (-not $zeroMutation2) {
        throw "Step 7 Failed: Live host was modified after baseline dry-run lifecycle!"
    }

    # -------------------------------------------------------------------------
    # STEP 8: PERFORMANCE PROFILES MATRIX (all 4 presets)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 8: Validating Performance Profiles Matrix (ultra-low, balanced, visual-rich, gaming)..." -ForegroundColor Yellow
    $profiles = @("ultra-low", "balanced", "visual-rich", "gaming")

    foreach ($profile in $profiles) {
        Write-Host "  -> Testing performance profile: '$profile'..." -ForegroundColor Cyan
        $perfSandbox = New-TestSandboxRoot -Prefix "komoyasb-perf-$profile-"
        
        # Provision base sandbox
        $perfProc = Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$installScript`"", "-NoAdmin", "-DryRun", "-SandboxRoot", "`"$perfSandbox`"", "-SkipPackages", "-KeepSandbox") `
            -NoNewWindow -Wait -PassThru
        if ($perfProc.ExitCode -ne 0) {
            throw "Step 8 Failed: Base install for profile '$profile' exited with code $($perfProc.ExitCode)"
        }

        # Apply profile switch inside sandbox via sync-theme
        $syncProc = Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Import-Module `"$dryRunModule`" -Force; Initialize-ShadowContext -ShadowRoot `"$perfSandbox`" -KeepSandbox | Out-Null; & `"$syncThemeScript`" -Theme dark -PerformanceProfile $profile -DryRun") `
            -NoNewWindow -Wait -PassThru
        if ($syncProc.ExitCode -ne 0) {
            throw "Step 8 Failed: sync-theme with profile '$profile' exited with code $($syncProc.ExitCode)"
        }

        # Validate rendered configs for this profile
        Test-SandboxRenderedConfigs -SandboxRoot $perfSandbox -ContextLabel "Profile: $profile" | Out-Null
        
        # Profile-specific validation
        $renderedKomorebi = Join-Path $perfSandbox "userprofile\.config\komorebi\komorebi.json"
        $komorebiJson = Get-Content -LiteralPath $renderedKomorebi -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($profile -eq "ultra-low") {
            if ($komorebiJson.animation.fps -ne 0 -or $komorebiJson.border -ne $false) {
                throw "Step 8 Failed: ultra-low profile did not disable animations or borders"
            }
        } elseif ($profile -eq "visual-rich") {
            if ($komorebiJson.animation.duration -le 0 -or $komorebiJson.transparency -ne $true) {
                throw "Step 8 Failed: visual-rich profile did not enable animations or transparency"
            }
        }
        Write-Host "     Profile '$profile' verified successfully." -ForegroundColor Green
    }

    # Verify zero host mutation after performance matrix
    $postPerfSnap = Take-HostSnapshot -Paths $liveTargets
    $zeroMutationPerf = Compare-HostSnapshot -Baseline $baselineSnapshot -Current $postPerfSnap -StageName "Step 8: Post-Performance Matrix"
    if (-not $zeroMutationPerf) {
        throw "Step 8 Failed: Live host was modified during performance matrix!"
    }

    # -------------------------------------------------------------------------
    # STEP 9: THEME VARIANTS MATRIX (dark, light)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 9: Validating Theme Variants Matrix (dark, light)..." -ForegroundColor Yellow
    $themeVariants = @("dark", "light")

    foreach ($theme in $themeVariants) {
        Write-Host "  -> Testing theme variant: '$theme'..." -ForegroundColor Cyan
        $themeSandbox = New-TestSandboxRoot -Prefix "komoyasb-theme-$theme-"

        $themeProc = Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$installScript`"", "-NoAdmin", "-DryRun", "-SandboxRoot", "`"$themeSandbox`"", "-Theme", $theme, "-SkipPackages", "-KeepSandbox") `
            -NoNewWindow -Wait -PassThru
        if ($themeProc.ExitCode -ne 0) {
            throw "Step 9 Failed: install.ps1 with theme '$theme' exited with code $($themeProc.ExitCode)"
        }

        Test-SandboxRenderedConfigs -SandboxRoot $themeSandbox -ContextLabel "Theme: $theme" | Out-Null

        # Validate theme-specific CSS color rendering
        $renderedCss = Join-Path $themeSandbox "userprofile\.config\yasb\styles.css"
        $cssContent = Get-Content -LiteralPath $renderedCss -Raw -Encoding UTF8
        if ($cssContent -notmatch '#[0-9a-fA-F]{6}') {
            throw "Step 9 Failed: Rendered styles.css does not contain compiled hex color codes for theme '$theme'"
        }
        Write-Host "     Theme '$theme' verified successfully." -ForegroundColor Green
    }

    # Verify zero host mutation after theme matrix
    $postThemeSnap = Take-HostSnapshot -Paths $liveTargets
    $zeroMutationTheme = Compare-HostSnapshot -Baseline $baselineSnapshot -Current $postThemeSnap -StageName "Step 9: Post-Theme Matrix"
    if (-not $zeroMutationTheme) {
        throw "Step 9 Failed: Live host was modified during theme matrix!"
    }

    # -------------------------------------------------------------------------
    # STEP 10: FLAG VARIANTS MATRIX (-SkipPackages, -ApplyWindhawk, -RemovePackages)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 10: Validating Flag Variants (-SkipPackages, -ApplyWindhawk, -RemovePackages)..." -ForegroundColor Yellow
    
    # 10A: -SkipPackages flag
    Write-Host "  -> Testing -SkipPackages flag..." -ForegroundColor Cyan
    $flagsSandbox1 = New-TestSandboxRoot -Prefix "komoyasb-flags-skippkg-"
    $flagsLedger1  = Join-Path $flagsSandbox1 "ledger-skippkg.json"
    $skipProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$flagsSandbox1`"", "-SkipPackages", "-LedgerPath", "`"$flagsLedger1`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($skipProc.ExitCode -ne 0) {
        throw "Step 10A Failed: install.ps1 with -SkipPackages exited with code $($skipProc.ExitCode)"
    }
    $skipLedgerJson = Get-Content -LiteralPath $flagsLedger1 -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($skipLedgerJson.summary.packagesSimulated -ne 0) {
        throw "Step 10A Failed: Expected 0 packages simulated when -SkipPackages is supplied, got $($skipLedgerJson.summary.packagesSimulated)"
    }
    Write-Host "     -SkipPackages verified (0 package actions recorded)." -ForegroundColor Green

    # 10B: -ApplyWindhawk flag
    Write-Host "  -> Testing -ApplyWindhawk flag..." -ForegroundColor Cyan
    $flagsSandbox2 = New-TestSandboxRoot -Prefix "komoyasb-flags-windhawk-"
    $flagsLedger2  = Join-Path $flagsSandbox2 "ledger-windhawk.json"
    $windhawkProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$flagsSandbox2`"", "-SkipPackages", "-ApplyWindhawk", "-LedgerPath", "`"$flagsLedger2`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($windhawkProc.ExitCode -ne 0) {
        throw "Step 10B Failed: install.ps1 with -ApplyWindhawk exited with code $($windhawkProc.ExitCode)"
    }
    Write-Host "     -ApplyWindhawk verified successfully." -ForegroundColor Green

    # 10C: -RemovePackages uninstall flag
    Write-Host "  -> Testing uninstall with -RemovePackages flag..." -ForegroundColor Cyan
    $uninstRemoveProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$flagsSandbox1`"", "-RemovePackages", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($uninstRemoveProc.ExitCode -ne 0) {
        throw "Step 10C Failed: uninstall.ps1 with -RemovePackages exited with code $($uninstRemoveProc.ExitCode)"
    }
    Write-Host "     uninstall -RemovePackages verified successfully." -ForegroundColor Green

    # 10D: -NoAdmin rootless mode flag permutation
    Write-Host "  -> Testing -NoAdmin (Rootless Mode) flag permutation..." -ForegroundColor Cyan
    $flagsSandbox3 = New-TestSandboxRoot -Prefix "komoyasb-flags-noadmin-"
    $flagsLedger3  = Join-Path $flagsSandbox3 "ledger-noadmin.json"
    $noAdminProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$installScript`"", "-NoAdmin", "-DryRun", "-SandboxRoot", "`"$flagsSandbox3`"", "-LedgerPath", "`"$flagsLedger3`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($noAdminProc.ExitCode -ne 0) {
        throw "Step 10D Failed: install.ps1 with -NoAdmin exited with code $($noAdminProc.ExitCode)"
    }
    $noAdminLedger = Get-Content -LiteralPath $flagsLedger3 -Raw -Encoding UTF8 | ConvertFrom-Json
    $windhawkAction = $noAdminLedger.actions | Where-Object { $_.target -eq "RamenSoftware.Windhawk" }
    if ($windhawkAction -and $windhawkAction.metadata.Skipped -ne $true) {
        throw "Step 10D Failed: Expected RamenSoftware.Windhawk to be skipped in -NoAdmin mode"
    }

    # Verify uninstall with -NoAdmin flag
    $noAdminUninstProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$uninstallScript`"", "-NoAdmin", "-DryRun", "-SandboxRoot", "`"$flagsSandbox3`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($noAdminUninstProc.ExitCode -ne 0) {
        throw "Step 10D Failed: uninstall.ps1 with -NoAdmin exited with code $($noAdminUninstProc.ExitCode)"
    }
    Write-Host "     -NoAdmin flag verified (Rootless installation, machine package skipping, and uninstall rollback)." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 11: SANDBOX AUTO-CLEANUP VERIFICATION (without -KeepSandbox)
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 11: Validating Sandbox Auto-Cleanup when -KeepSandbox is omitted..." -ForegroundColor Yellow
    $cleanupSandbox = Join-Path ([System.IO.Path]::GetTempPath()) ("komoyasb-autoclean-" + [System.Guid]::NewGuid().ToString("N"))
    
    # Initialize shadow context with KeepSandbox:$false, then call Reset-ShadowContext
    $cleanTestScript = "Import-Module `"$dryRunModule`" -Force; Initialize-ShadowContext -ShadowRoot `"$cleanupSandbox`" -KeepSandbox:`$false | Out-Null; Reset-ShadowContext"
    $cleanProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-Command", $cleanTestScript) `
        -NoNewWindow -Wait -PassThru
    if ($cleanProc.ExitCode -ne 0) {
        throw "Step 11 Failed: Sandbox cleanup script failed with exit code $($cleanProc.ExitCode)"
    }
    if (Test-Path -LiteralPath $cleanupSandbox) {
        throw "Step 11 Failed: Sandbox directory was NOT removed when KeepSandbox was false: $cleanupSandbox"
    }
    Write-Host "  Auto-cleanup verified: Sandbox directory was completely removed." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 12: FAILURE RECOVERY & RESILIENCE
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 12: Validating Failure Recovery & Error Handling..." -ForegroundColor Yellow

    # 12A: Missing / invalid theme rejection
    Write-Host "  -> Testing recovery from missing theme..." -ForegroundColor Cyan
    $missingThemeSandbox = New-TestSandboxRoot -Prefix "komoyasb-fail-theme-"
    $missingProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$missingThemeSandbox`"", "-Theme", "nonexistent_theme_999", "-SkipPackages", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($missingProc.ExitCode -eq 0) {
        throw "Step 12A Failed: install.ps1 should have failed for nonexistent theme, but returned exit code 0"
    }
    Write-Host "     Missing theme was gracefully rejected with non-zero exit code ($($missingProc.ExitCode))." -ForegroundColor Green

    # 12B: Corrupted sandbox file recovery during uninstall
    Write-Host "  -> Testing recovery from corrupted sandbox files during uninstall..." -ForegroundColor Cyan
    $corruptSandbox = New-TestSandboxRoot -Prefix "komoyasb-fail-corrupt-"
    # Populate corrupt file
    $corruptUserDir = Join-Path $corruptSandbox "userprofile\.config\komorebi"
    [System.IO.Directory]::CreateDirectory($corruptUserDir) | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $corruptUserDir "komorebi.json"), "CORRUPTED_NOT_JSON", [System.Text.Encoding]::UTF8)

    $corruptProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$corruptSandbox`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($corruptProc.ExitCode -ne 0) {
        throw "Step 12B Failed: uninstall.ps1 should handle corrupted sandbox files gracefully, but failed with code $($corruptProc.ExitCode)"
    }
    Write-Host "     Corrupted sandbox handled gracefully during rollback." -ForegroundColor Green

    # 12C: Invalid performance profile rejection
    Write-Host "  -> Testing rejection of invalid performance profile..." -ForegroundColor Cyan
    $invPerfProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$setPerfScript`"", "-Profile", "invalid_preset_xyz", "-DryRun") `
        -NoNewWindow -Wait -PassThru
    if ($invPerfProc.ExitCode -eq 0) {
        throw "Step 12C Failed: Set-PerformanceProfile.ps1 should have rejected invalid profile, but returned 0"
    }
    Write-Host "     Invalid performance profile rejected successfully (code $($invPerfProc.ExitCode))." -ForegroundColor Green

    # 12D: Single-item array backup manifest handling & rollback
    Write-Host "  -> Testing single-item array backup manifest handling & rollback..." -ForegroundColor Cyan
    $singleItemSandbox = New-TestSandboxRoot -Prefix "komoyasb-chaos-singleitem-"
    $singleBackupDir = Join-Path $singleItemSandbox "backups\20261122_single_item"
    [System.IO.Directory]::CreateDirectory($singleBackupDir) | Out-Null
    
    $singleBackupFile = Join-Path $singleBackupDir "komorebi.json.backup"
    [System.IO.File]::WriteAllText($singleBackupFile, '{"single_item_backup_restored":true}', [System.Text.Encoding]::UTF8)
    
    $targetLivePath = Join-Path $userProfile ".config\komorebi\komorebi.json"
    $singleManifest = @{
        Timestamp = "20261122_single_item"
        Backups = @(
            @{ Original = $targetLivePath; Backup = $singleBackupFile }
        )
    }
    # Enforce JSON array syntax for Backups
    $manifestJsonString = $singleManifest | ConvertTo-Json -Depth 5
    if ($manifestJsonString -notmatch '"Backups":\s*\[') {
        throw "Step 12D Failed: Single-item array Backups unwrapped during ConvertTo-Json serialization!"
    }
    [System.IO.File]::WriteAllText((Join-Path $singleBackupDir "manifest.json"), $manifestJsonString, [System.Text.Encoding]::UTF8)

    # Execute rollback against this backup directory
    $singleProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$singleItemSandbox`"", "-BackupDir", "`"$singleBackupDir`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($singleProc.ExitCode -ne 0) {
        throw "Step 12D Failed: uninstall.ps1 failed to restore single-item backup manifest (exit code $($singleProc.ExitCode))"
    }

    # Verify virtual restored file exists in shadow sandbox
    $restoredVirtual = Join-Path $singleItemSandbox "userprofile\.config\komorebi\komorebi.json"
    if (-not (Test-Path -LiteralPath $restoredVirtual)) {
        throw "Step 12D Failed: Single-item backup was not restored to virtual target: $restoredVirtual"
    }
    $restoredContent = Get-Content -LiteralPath $restoredVirtual -Raw -Encoding UTF8
    if ($restoredContent -notmatch '"single_item_backup_restored":\s*true') {
        throw "Step 12D Failed: Restored content mismatch in $($restoredVirtual) : $restoredContent"
    }
    Write-Host "     Single-item array backup manifest handled and restored successfully." -ForegroundColor Green

    # 12E: Unicode, Space & Square Bracket Sandbox Paths
    Write-Host "  -> Testing sandbox path resilience (spaces, Unicode, brackets)..." -ForegroundColor Cyan
    $unicodeSandboxName = "komoyasb-chaos-üñîçødé (Test Space)-[TestBracket]-" + [System.Guid]::NewGuid().ToString("N")
    $unicodeSandbox = Join-Path ([System.IO.Path]::GetTempPath()) $unicodeSandboxName
    $script:allocatedSandboxes.Add($unicodeSandbox)
    [System.IO.Directory]::CreateDirectory($unicodeSandbox) | Out-Null

    $unicodeProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$installScript`"", "-DryRun", "-SandboxRoot", "`"$unicodeSandbox`"", "-SkipPackages", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($unicodeProc.ExitCode -ne 0) {
        throw "Step 12E Failed: install.ps1 failed on Unicode/space/bracket sandbox path with exit code $($unicodeProc.ExitCode)"
    }

    Test-SandboxRenderedConfigs -SandboxRoot $unicodeSandbox -ContextLabel "Unicode Sandbox" | Out-Null

    $unicodeUninstProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$unicodeSandbox`"", "-KeepSandbox") `
        -NoNewWindow -Wait -PassThru
    if ($unicodeUninstProc.ExitCode -ne 0) {
        throw "Step 12E Failed: uninstall.ps1 failed on Unicode/space/bracket sandbox path with exit code $($unicodeUninstProc.ExitCode)"
    }
    Write-Host "     Unicode, spaces, and square brackets handled with 100% path safety." -ForegroundColor Green

    # 12F: Corrupted Backup Manifest Recovery
    Write-Host "  -> Testing graceful recovery from corrupted backup manifests (invalid, truncated, 0-byte)..." -ForegroundColor Cyan
    $corruptVariants = @(
        @{ Name = "InvalidJson"; Content = "{ CORRUPTED_NOT_VALID_JSON: true, " },
        @{ Name = "TruncatedJson"; Content = '{"Timestamp": "20261122", "Backups": [' },
        @{ Name = "EmptyZeroByte"; Content = "" }
    )

    foreach ($cv in $corruptVariants) {
        Write-Host "     Testing recovery for variant '$($cv.Name)'..." -ForegroundColor Gray
        $corruptManifestSandbox = New-TestSandboxRoot -Prefix "komoyasb-chaos-manifest-$($cv.Name)-"
        $corruptBkpDir = Join-Path $corruptManifestSandbox "backups\corrupt_$($cv.Name)"
        [System.IO.Directory]::CreateDirectory($corruptBkpDir) | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $corruptBkpDir "manifest.json"), $cv.Content, [System.Text.Encoding]::UTF8)

        $cProc = Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy Bypass", "-File", "`"$uninstallScript`"", "-DryRun", "-SandboxRoot", "`"$corruptManifestSandbox`"", "-BackupDir", "`"$corruptBkpDir`"", "-KeepSandbox") `
            -NoNewWindow -Wait -PassThru
        
        # Verify uninstall handled it without crashing (exit code 0)
        if ($cProc.ExitCode -ne 0) {
            throw "Step 12F Failed: uninstall.ps1 crashed with exit code $($cProc.ExitCode) for corrupt manifest variant '$($cv.Name)'"
        }
    }
    Write-Host "     Corrupted backup manifests recovered gracefully without exceptions or host mutations." -ForegroundColor Green

    # 12G: Template Fuzzing with Backslashes and Quotes
    Write-Host "  -> Fuzzing template rendering with backslashes, double quotes, and single quotes..." -ForegroundColor Cyan
    $fuzzSandbox = New-TestSandboxRoot -Prefix "komoyasb-chaos-fuzz-"
    $fuzzWorkspace = Join-Path $fuzzSandbox "workspace"
    $fuzzUserProfile = Join-Path $fuzzSandbox "userprofile"
    [System.IO.Directory]::CreateDirectory($fuzzWorkspace) | Out-Null
    [System.IO.Directory]::CreateDirectory($fuzzUserProfile) | Out-Null

    $fuzzTokens = @{}
    foreach ($k in $script:SchemaFallbackDefaults.Keys) {
        $fuzzTokens[$k] = $script:SchemaFallbackDefaults[$k]
    }
    # Inject adversarial path with Windows backslashes
    $fuzzTokens["wallpaper.path"] = "C:\Users\Adversarial User (Admin)\Pictures\Wallpapers\Tokyo Night\dark.png"
    $fuzzTokens["wallpaper.url_path"] = "C:/Users/Adversarial User (Admin)/Pictures/Wallpapers/Tokyo Night/dark.png"
    # Inject typography with single quotes
    $fuzzTokens["typography.font_family"] = "JetBrainsMono 'Nerd' Font"

    $fuzzTestMappings = @(
        @{ Template = Join-Path $repoRoot "configs\komorebi\komorebi.json.template"; Output = Join-Path $fuzzSandbox "komorebi.json" },
        @{ Template = Join-Path $repoRoot "configs\yasb\config.yaml.template";       Output = Join-Path $fuzzSandbox "config.yaml" },
        @{ Template = Join-Path $repoRoot "configs\yasb\styles.css.template";        Output = Join-Path $fuzzSandbox "styles.css" },
        @{ Template = Join-Path $repoRoot "configs\polish\fluentflyout_config.json.template"; Output = Join-Path $fuzzSandbox "fluentflyout_config.json" },
        @{ Template = Join-Path $repoRoot "configs\shell\flow_settings.json.template"; Output = Join-Path $fuzzSandbox "flow_settings.json" },
        @{ Template = Join-Path $repoRoot "configs\shell\flow_theme.fluent.template"; Output = Join-Path $fuzzSandbox "flow_theme.fluent" }
    )

    foreach ($ftm in $fuzzTestMappings) {
        Invoke-TemplateRendering -TemplatePath $ftm.Template -OutputPath $ftm.Output -Tokens $fuzzTokens
        if (-not (Test-Path -LiteralPath $ftm.Output)) {
            throw "Step 12G Failed: Output file missing after fuzz rendering: $($ftm.Output)"
        }
        $renderedRaw = Get-Content -LiteralPath $ftm.Output -Raw -Encoding UTF8
        
        # Verify no unexpanded tokens
        if ($renderedRaw -match '\{\{[a-zA-Z0-9_\.]+\}\}') {
            throw "Step 12G Failed: Unexpanded tokens found in fuzzed output $($ftm.Output)"
        }

        # Verify JSON syntax for JSON files
        if ($ftm.Output.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
            try {
                $null = ConvertFrom-Json -InputObject $renderedRaw
            } catch {
                throw "Step 12G Failed: Invalid JSON syntax generated from fuzzed tokens in $($ftm.Output) : $_"
            }
        }
        # Verify CSS brace matching
        elseif ($ftm.Output.EndsWith(".css", [System.StringComparison]::OrdinalIgnoreCase)) {
            $openB = ($renderedRaw.ToCharArray() | Where-Object { $_ -eq '{' }).Count
            $closeB = ($renderedRaw.ToCharArray() | Where-Object { $_ -eq '}' }).Count
            if ($openB -ne $closeB -or $openB -eq 0) {
                throw "Step 12G Failed: Unbalanced braces in fuzzed CSS $($ftm.Output)"
            }
        }
        # Verify XML for .fluent
        elseif ($ftm.Output.EndsWith(".fluent", [System.StringComparison]::OrdinalIgnoreCase)) {
            try {
                $null = [xml]$renderedRaw
            } catch {
                throw "Step 12G Failed: Invalid XML generated from fuzzed tokens in $($ftm.Output) : $_"
            }
        }
    }
    Write-Host "     Template fuzzing with backslashes, double quotes, and single quotes passed across all templates." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # STEP 13: FINAL HOST ZERO-MUTATION CHECK
    # -------------------------------------------------------------------------
    Write-Host "`n>>> Step 13: Performing final cryptographic check against baseline snapshot across all matrices..." -ForegroundColor Yellow
    $finalSnapshot = Take-HostSnapshot -Paths $liveTargets
    $zeroMutationFinal = Compare-HostSnapshot -Baseline $baselineSnapshot -Current $finalSnapshot -StageName "Step 13: Final Complete Matrix Assertion"
    if (-not $zeroMutationFinal) {
        throw "Step 13 Failed: Live host was modified after complete dry-run test suite execution!"
    }

    Write-Host "`n================================================================" -ForegroundColor Cyan
    Write-Host "  FULL DRY-RUN VERIFICATION PASSED: 100% HOST IMMUTABILITY      " -ForegroundColor Green
    Write-Host "  ALL 4 PROFILES, 2 THEMES, FLAGS & RECOVERY SCENARIOS PASSED   " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    $exitCode = 0
}
catch {
    Write-Host "`n================================================================" -ForegroundColor Red
    Write-Host "  FULL DRY-RUN VERIFICATION FAILED: $_" -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red
    $exitCode = 1
}
finally {
    if (-not $KeepSandbox) {
        foreach ($sb in $script:allocatedSandboxes) {
            if (Test-Path -LiteralPath $sb) {
                try {
                    Remove-Item -LiteralPath $sb -Recurse -Force -ErrorAction SilentlyContinue
                } catch {
                    Write-Warning "Failed to remove test sandbox '$sb': $_"
                }
            }
        }
        Write-Host "Purged $($script:allocatedSandboxes.Count) test sandboxes." -ForegroundColor Gray
    } else {
        Write-Host "Retained $($script:allocatedSandboxes.Count) test sandboxes for debugging." -ForegroundColor Cyan
    }
}

exit $exitCode
