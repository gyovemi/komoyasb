<#
.SYNOPSIS
    Compiles unified theme and performance tokens into concrete runtime configuration files.
.DESCRIPTION
    Reads a theme JSON file (e.g. themes/dark.json or themes/light.json), validates
    against themes/theme.schema.json, expands color / opacity tokens, merges performance
    tokens from performance.json (or specified -PerformanceProfile), and renders all
    registered template files (*.template) across the workspace into their runtime targets.
.PARAMETER Theme
    The name or file path of the theme to apply. Defaults to "dark".
.PARAMETER PerformanceProfile
    Optional performance profile override (e.g. "ultra-low", "balanced", "visual-rich", "gaming").
    If not specified, uses active_profile from performance.json (or themes/.current_perf).
.PARAMETER DryRun
    Simulates the rendering without writing any files to disk.
.OUTPUTS
    None. Outputs compilation progress logs to console.
.EXAMPLE
    .\sync-theme.ps1 -Theme dark -PerformanceProfile balanced
.EXAMPLE
    .\sync-theme.ps1 -Theme light -DryRun
.NOTES
    Part of the komoyasb desktop automation suite.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [string]$Theme = "dark",

    [Parameter(Mandatory = $false)]
    [string]$PerformanceProfile = "",

    [Parameter(Mandatory = $false)]
    [string]$SandboxRoot = "",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSCmdlet.ShouldProcess($Theme, "Render Theme and Performance Config")) {
    # If -WhatIf is passed to ShouldProcess, it returns false automatically!
}

if ($PSBoundParameters.ContainsKey('WhatIf') -or $DryRun -or $SandboxRoot) {
    $DryRun = $true
}

$coreHelpersDir = Join-Path $PSScriptRoot "lib"
Import-Module (Join-Path $coreHelpersDir "Environment.psm1") -Force
Import-Module (Join-Path $coreHelpersDir "TemplateEngine.psm1") -Force

if ($DryRun) {
    $existingContext = Get-Variable -Name "KomoyasbShadowContext" -Scope Global -ErrorAction SilentlyContinue
    if (-not $existingContext -or -not $existingContext.Value -or -not $existingContext.Value.Active -or $SandboxRoot) {
        if ($SandboxRoot) {
            Initialize-ShadowContext -ShadowRoot $SandboxRoot | Out-Null
        } else {
            Initialize-ShadowContext | Out-Null
        }
    }
}

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

$workspaceRoot = Get-WorkspaceRoot
Write-Host "Workspace Root: $workspaceRoot"

# 1. Resolve Theme File Path
if ($Theme -match '\.\.[/\\]' -or $Theme -match '[/\\]\.\.' -or $Theme.StartsWith("..")) {
    throw "Security violation: Path traversal token '..' detected in Theme parameter '$Theme'."
}

$themePath = $Theme
if (-not (Test-Path -LiteralPath $themePath)) {
    # Check under themes/
    $candidatePath = Join-Path (Join-Path $workspaceRoot "themes") "$Theme.json"
    if (Test-Path -LiteralPath $candidatePath) {
        $themePath = $candidatePath
    }
    else {
        $candidateWithoutExt = Join-Path (Join-Path $workspaceRoot "themes") $Theme
        if (Test-Path -LiteralPath $candidateWithoutExt) {
            $themePath = $candidateWithoutExt
        }
        else {
            # Search by theme "name" property across all *.json in themes/
            $matchedByThemeName = $null
            $themesDir = Join-Path $workspaceRoot "themes"
            if (Test-Path -LiteralPath $themesDir) {
                $themeFiles = Get-ChildItem -LiteralPath $themesDir -Filter "*.json" -File
                foreach ($candidateThemeFile in $themeFiles) {
                    if ($candidateThemeFile.Name -eq "theme.schema.json" -or $candidateThemeFile.Name -eq "performance.schema.json") { continue }
                    try {
                        $parsedThemeJson = Get-Content -LiteralPath $candidateThemeFile.FullName -Raw | ConvertFrom-Json
                        if ($parsedThemeJson.PSObject.Properties['name'] -and ($parsedThemeJson.name -eq $Theme -or $parsedThemeJson.name.Trim().ToLower() -eq $Theme.Trim().ToLower())) {
                            $matchedByThemeName = $candidateThemeFile.FullName
                            break
                        }
                    } catch {}
                }
            }

            if ($matchedByThemeName) {
                $themePath = $matchedByThemeName
            } else {
                throw "Theme not found: $Theme (searched at $candidatePath)"
            }
        }
    }
}

$canonicalThemePath = (Resolve-Path -LiteralPath $themePath).Path
$canonicalWorkspace = [System.IO.Path]::GetFullPath($workspaceRoot)
if (-not $canonicalWorkspace.EndsWith([System.IO.Path]::DirectorySeparatorChar.ToString())) {
    $canonicalWorkspace += [System.IO.Path]::DirectorySeparatorChar
}
if (-not $canonicalThemePath.StartsWith($canonicalWorkspace, [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $canonicalThemePath.Equals($canonicalWorkspace.TrimEnd([System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Security violation: Theme file '$themePath' resolves outside workspace root."
}
$themePath = $canonicalThemePath
Write-Host "Applying Theme: $themePath"

# 2. Read and parse Theme JSON
$themeRaw = [System.IO.File]::ReadAllText($themePath, [System.Text.Encoding]::UTF8)
$themeObj = $themeRaw | ConvertFrom-Json

# Flatten tokens once
$baseTokens = Get-FlattenedTokens -JsonObject $themeObj
# Expand computed tokens (alpha, rgb, argb) once
$tokens = Expand-ComputedTokens -Tokens $baseTokens

# Ensure wallpaper path is converted to full absolute path if relative
if ($tokens.ContainsKey("wallpaper.path")) {
    $wallRel = $tokens["wallpaper.path"]
    if ($wallRel -match '\.\.[/\\]' -or $wallRel -match '[/\\]\.\.' -or $wallRel.StartsWith("..")) {
        throw "Security violation: Path traversal token '..' detected in wallpaper.path: '$wallRel'."
    }
    if (-not [System.IO.Path]::IsPathRooted($wallRel)) {
        $tokens["wallpaper.path"] = (Join-Path $workspaceRoot $wallRel).Replace('/', '\')
    }
    # Normalized forward slashes token for CSS / YAML URL references
    $tokens["wallpaper.url_path"] = $tokens["wallpaper.path"].Replace('\', '/')
}

# 2b. Read and parse performance.json
$perfFile = Join-Path $workspaceRoot "performance.json"
$effectivePerfFile = if ($isDry -and (Get-Command "Resolve-TargetPath" -ErrorAction SilentlyContinue)) {
    Resolve-TargetPath -Path $perfFile -Mode "Read"
} else {
    $perfFile
}

$activePerfProfile = "balanced"
if (Test-Path -LiteralPath $effectivePerfFile) {
    $perfRaw = [System.IO.File]::ReadAllText($effectivePerfFile, [System.Text.Encoding]::UTF8)
    $perfObj = $perfRaw | ConvertFrom-Json

    # Check override parameter, then performance.json active_profile
    if (-not [string]::IsNullOrWhiteSpace($PerformanceProfile)) {
        $activePerfProfile = $PerformanceProfile
    } elseif ($perfObj.PSObject.Properties['active_profile']) {
        $activePerfProfile = [string]$perfObj.active_profile
    }

    if (-not $perfObj.profiles.PSObject.Properties[$activePerfProfile]) {
        throw "Performance profile '$activePerfProfile' not found in $effectivePerfFile"
    }

    $profileObj = $perfObj.profiles.PSObject.Properties[$activePerfProfile].Value
    $perfTokens = Get-FlattenedTokens -JsonObject $profileObj -Prefix "perf"

    foreach ($k in $perfTokens.Keys) {
        $tokens[$k] = $perfTokens[$k]
    }

    # Aliases and derived performance tokens
    # e.g. perf.komorebi.unmanaged_behaviour -> unmanaged_window_operation_behaviour
    if ($tokens.ContainsKey("perf.komorebi.unmanaged_window_operation_behaviour")) {
        $tokens["perf.komorebi.unmanaged_behaviour"] = $tokens["perf.komorebi.unmanaged_window_operation_behaviour"]
    }
    # perf.flow.* aliases matching docs/PERFORMANCE_ARCHITECTURE.md contract
    if ($tokens.ContainsKey("perf.launcher.use_animation")) {
        $tokens["perf.flow.use_animation"] = $tokens["perf.launcher.use_animation"]
    }
    if ($tokens.ContainsKey("perf.launcher.animation_speed")) {
        $tokens["perf.flow.animation_speed"] = $tokens["perf.launcher.animation_speed"]
    }
    if ($tokens.ContainsKey("perf.launcher.search_window_effect")) {
        $tokens["perf.flow.search_window_effect"] = $tokens["perf.launcher.search_window_effect"]
    }
    if ($tokens.ContainsKey("perf.launcher.shadow_effect")) {
        $tokens["perf.flow.shadow_effect"] = $tokens["perf.launcher.shadow_effect"]
    }
    if ($tokens.ContainsKey("perf.launcher.max_results")) {
        $tokens["perf.flow.max_results"] = $tokens["perf.launcher.max_results"]
    }
    # perf.yasb.transition_duration for CSS styling
    if ($tokens.ContainsKey("perf.yasb.animation_duration_ms")) {
        $durationMs = [int]$tokens["perf.yasb.animation_duration_ms"]
        if ($durationMs -le 0) {
            $tokens["perf.yasb.transition_duration"] = "0s"
        } else {
            $seconds = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.##}", ($durationMs / 1000.0))
            $tokens["perf.yasb.transition_duration"] = "${seconds}s ease"
        }
    }

    Write-Host "Applied Performance Profile: $activePerfProfile"
} else {
    Write-Verbose "performance.json not found at $effectivePerfFile; skipping performance token injection."
}

Write-Verbose "Total active combined tokens: $($tokens.Count)"

# 3. Define Template Mapping Matrix
# Maps relative template paths to their runtime destinations:
# Can target workspace outputs or user profile runtime locations
$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
$appData = if ($env:APPDATA) { $env:APPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }

$templateMappings = @(
    # Komorebi & whkd
    @{
        Template = "configs/komorebi/komorebi.json.template"
        TargetLocal = "configs/komorebi/komorebi.json"
        TargetRuntime = (Join-Path $userProfile ".config\komorebi\komorebi.json")
    },
    @{
        Template = "configs/komorebi/whkdrc.template"
        TargetLocal = "configs/komorebi/whkdrc"
        TargetRuntime = (Join-Path $userProfile ".config\whkdrc")
    },
    # YASB Reborn
    @{
        Template = "configs/yasb/config.yaml.template"
        TargetLocal = "configs/yasb/config.yaml"
        TargetRuntime = (Join-Path $userProfile ".config\yasb\config.yaml")
    },
    @{
        Template = "configs/yasb/styles.css.template"
        TargetLocal = "configs/yasb/styles.css"
        TargetRuntime = (Join-Path $userProfile ".config\yasb\styles.css")
    },
    # Flow Launcher
    @{
        Template = "configs/shell/flow_settings.json.template"
        TargetLocal = "configs/shell/flow_settings.json"
        TargetRuntime = (Join-Path $appData "FlowLauncher\Settings\Settings.json")
    },
    @{
        Template = "configs/shell/flow_theme.fluent.template"
        TargetLocal = "configs/shell/flow_theme.fluent"
        TargetRuntime = (Join-Path $appData "FlowLauncher\Themes\KomoyasbFluent.xaml")
    },
    # FluentFlyout
    @{
        Template = "configs/polish/fluentflyout_config.json.template"
        TargetLocal = "configs/polish/fluentflyout_config.json"
        TargetRuntime = $null # Target path determined by package or local app directory
    }
)

# 4. Render all templates
foreach ($map in $templateMappings) {
    $fullTemplate = Join-Path $workspaceRoot $map.Template
    if (Test-Path -LiteralPath $fullTemplate) {
        # Render local workspace copy
        $fullLocalTarget = Join-Path $workspaceRoot $map.TargetLocal
        Invoke-TemplateRendering -TemplatePath $fullTemplate -OutputPath $fullLocalTarget -Tokens $tokens -DryRun:$DryRun
        Write-Host "[RENDERED] $($map.Template) -> $($map.TargetLocal)"

        # Render to runtime directory if directory or runtime target exists
        if ($map.TargetRuntime) {
            $effectiveRuntime = if ($isDry -and (Get-Command "Resolve-TargetPath" -ErrorAction SilentlyContinue)) {
                Resolve-TargetPath -Path $map.TargetRuntime -Mode "Write"
            } else {
                $map.TargetRuntime
            }

            $runtimeParent = Split-Path -Parent $effectiveRuntime
            $canAccess = $false
            try {
                $canAccess = Test-Path -LiteralPath $runtimeParent -ErrorAction SilentlyContinue
            } catch {
                $canAccess = $false
            }

            if ($canAccess -or $isDry) {
                try {
                    $targetOutput = if ($isDry) { $effectiveRuntime } else { $map.TargetRuntime }
                    Invoke-TemplateRendering -TemplatePath $fullTemplate -OutputPath $targetOutput -Tokens $tokens -DryRun:$DryRun
                    Write-Host "[DEPLOYED] -> $($map.TargetRuntime)"
                } catch {
                    Write-Warning "Could not deploy to $($map.TargetRuntime): $_"
                }
            }
        }
    }
    else {
        Write-Verbose "Template not found (yet): $fullTemplate - skipping"
    }
}

# 5. Sync Wallpaper if sync-wallpaper.ps1 is available
$wallpaperScript = Join-Path $workspaceRoot "scripts/sync-wallpaper.ps1"
if (Test-Path -LiteralPath $wallpaperScript) {
    if ($tokens.ContainsKey("wallpaper.path")) {
        Write-Host "Triggering wallpaper synchronization: $($tokens['wallpaper.path'])"
        $wallStyle = if ($tokens.ContainsKey("wallpaper.style")) { $tokens["wallpaper.style"] } else { "Fill" }
        try {
            & $wallpaperScript -Path $tokens["wallpaper.path"] -Style $wallStyle -DryRun:$isDry
        }
        catch {
            Write-Warning "Failed to execute sync-wallpaper.ps1: $_"
        }
    }
}

$isDry = $DryRun -or ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun))

# 6. Record Current Active Theme State
$stateFile = Join-Path (Join-Path $workspaceRoot "themes") ".current_theme"
if ($isDry) {
    if (Get-Command "Resolve-TargetPath" -ErrorAction SilentlyContinue) {
        $effectiveStateFile = Resolve-TargetPath -Path $stateFile -Mode "Write"
        $stateDir = Split-Path -Parent $effectiveStateFile
        if ($stateDir -and -not (Test-Path -LiteralPath $stateDir)) {
            [System.IO.Directory]::CreateDirectory($stateDir) | Out-Null
        }
        [System.IO.File]::WriteAllText($effectiveStateFile, $themeObj.name, [System.Text.UTF8Encoding]::new($false))
        if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
            Invoke-SystemAction -ActionType "FileWrite" -Target $stateFile -Metadata @{
                virtualPath = $effectiveStateFile
                livePath = $stateFile
                theme = $themeObj.name
            }
        }
        Write-Host "[DRYRUN] Wrote shadow theme marker: $effectiveStateFile -> $($themeObj.name)"
    }
} else {
    [System.IO.File]::WriteAllText($stateFile, $themeObj.name, [System.Text.UTF8Encoding]::new($false))
}

# 7. Record Current Active Performance Profile State
if (-not [string]::IsNullOrWhiteSpace($activePerfProfile)) {
    $perfStateFile = Join-Path (Join-Path $workspaceRoot "themes") ".current_perf"
    if ($isDry) {
        if (Get-Command "Resolve-TargetPath" -ErrorAction SilentlyContinue) {
            $effectivePerfState = Resolve-TargetPath -Path $perfStateFile -Mode "Write"
            $perfStateDir = Split-Path -Parent $effectivePerfState
            if ($perfStateDir -and -not (Test-Path -LiteralPath $perfStateDir)) {
                [System.IO.Directory]::CreateDirectory($perfStateDir) | Out-Null
            }
            [System.IO.File]::WriteAllText($effectivePerfState, $activePerfProfile, [System.Text.UTF8Encoding]::new($false))
            if (Get-Command "Invoke-SystemAction" -ErrorAction SilentlyContinue) {
                Invoke-SystemAction -ActionType "FileWrite" -Target $perfStateFile -Metadata @{
                    virtualPath = $effectivePerfState
                    livePath = $perfStateFile
                    profile = $activePerfProfile
                }
            }
            Write-Host "[DRYRUN] Wrote shadow performance profile marker: $effectivePerfState -> $activePerfProfile"
        }
    } else {
        [System.IO.File]::WriteAllText($perfStateFile, $activePerfProfile, [System.Text.UTF8Encoding]::new($false))
    }
}

Write-Host "Theme and performance synchronization complete for: $($themeObj.name) (Profile: $activePerfProfile)"
