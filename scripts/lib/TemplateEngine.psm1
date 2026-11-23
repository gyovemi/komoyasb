<#
.SYNOPSIS
    Template compilation and token substitution engine for YAML, JSON, CSS, and WHKD configurations.
.DESCRIPTION
    Processes configuration templates (*.template) by flattening theme and performance JSON tokens,
    computing RGBA/RGB color variants, and rendering target files with atomic hash-based change detection.
.NOTES
    Part of the komoyasb desktop automation suite.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Import DryRunContext module if present
$dryRunModulePath = Join-Path $PSScriptRoot "DryRunContext.psm1"
if (Test-Path -LiteralPath $dryRunModulePath) {
    Import-Module $dryRunModulePath -Force
}

function Get-FlattenedTokens {
    <#
    .SYNOPSIS
        Flattens hierarchical JSON objects into dot-notated token key-value pairs.
    .DESCRIPTION
        Recursively traverses PSObject or hashtable structures, formatting booleans as lowercase
        and concatenating keys using dot notation (e.g. colors.accent).
    .PARAMETER JsonObject
        The parsed JSON PSCustomObject or dictionary to flatten.
    .PARAMETER Prefix
        Current key prefix during recursive traversal.
    .OUTPUTS
        [hashtable] Dictionary of flattened string tokens.
    .EXAMPLE
        $tokens = Get-FlattenedTokens -JsonObject $themeConfig
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$JsonObject,

        [Parameter(Mandatory = $false)]
        [string]$Prefix = ""
    )

    $flattenedTokens = @{}

    foreach ($property in $JsonObject.PSObject.Properties) {
        $tokenKey = if ($Prefix -eq "") { $property.Name } else { "$Prefix.$($property.Name)" }
        $propertyValue = $property.Value

        if ($propertyValue -is [System.Management.Automation.PSCustomObject] -or $propertyValue -is [System.Collections.IDictionary]) {
            $subTokens = Get-FlattenedTokens -JsonObject $propertyValue -Prefix $tokenKey
            foreach ($subKey in $subTokens.Keys) {
                $flattenedTokens[$subKey] = $subTokens[$subKey]
            }
        }
        elseif ($propertyValue -is [bool]) {
            # Format booleans explicitly as lowercase 'true'/'false' for JSON/YAML/CSS compatibility
            $flattenedTokens[$tokenKey] = if ($propertyValue) { "true" } else { "false" }
        }
        else {
            $flattenedTokens[$tokenKey] = [string]$propertyValue
        }
    }

    return $flattenedTokens
}

function Convert-HexToRgba {
    <#
    .SYNOPSIS
        Converts a 6-character hex color code and alpha float into CSS rgba format.
    .DESCRIPTION
        Extracts RGB byte channels from hex and formats into rgba(r, g, b, alpha) string.
    .PARAMETER Hex
        Hex color string with or without leading hash (e.g. "#1E1E2E").
    .PARAMETER Alpha
        Opacity float value between 0.0 and 1.0.
    .OUTPUTS
        [string] Formatted rgba string.
    .EXAMPLE
        Convert-HexToRgba -Hex "#FF5500" -Alpha 0.8
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Hex,

        [Parameter(Mandatory = $true)]
        [double]$Alpha
    )

    $cleanHex = $Hex.TrimStart('#')
    if ($cleanHex.Length -eq 6) {
        $red = [Convert]::ToInt32($cleanHex.Substring(0, 2), 16)
        $green = [Convert]::ToInt32($cleanHex.Substring(2, 2), 16)
        $blue = [Convert]::ToInt32($cleanHex.Substring(4, 2), 16)
        $alphaString = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.##}", $Alpha)
        return "rgba($red, $green, $blue, $alphaString)"
    }
    return $Hex
}

function Convert-HexToRgb {
    <#
    .SYNOPSIS
        Converts a 6-character hex color code into standard CSS rgb format.
    .DESCRIPTION
        Extracts RGB byte channels and returns rgb(r, g, b) string.
    .PARAMETER Hex
        Hex color string with or without leading hash.
    .OUTPUTS
        [string] Formatted rgb string.
    .EXAMPLE
        Convert-HexToRgb -Hex "#FFFFFF"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Hex
    )

    $cleanHex = $Hex.TrimStart('#')
    if ($cleanHex.Length -eq 6) {
        $red = [Convert]::ToInt32($cleanHex.Substring(0, 2), 16)
        $green = [Convert]::ToInt32($cleanHex.Substring(2, 2), 16)
        $blue = [Convert]::ToInt32($cleanHex.Substring(4, 2), 16)
        return "rgb($red, $green, $blue)"
    }
    return $Hex
}

function Convert-HexToArgbHex {
    <#
    .SYNOPSIS
        Converts a hex color code and alpha float into 8-digit ARGB hex string (#AARRGGBB).
    .DESCRIPTION
        Calculates alpha byte and prepends to 6-digit RGB hex code for Windows/XAML color compatibility.
    .PARAMETER Hex
        6-character hex color string.
    .PARAMETER Alpha
        Opacity float value between 0.0 and 1.0.
    .OUTPUTS
        [string] 8-digit ARGB hex string (e.g. "#CC1E1E2E").
    .EXAMPLE
        Convert-HexToArgbHex -Hex "#1E1E2E" -Alpha 0.8
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Hex,

        [Parameter(Mandatory = $true)]
        [double]$Alpha
    )

    $cleanHex = $Hex.TrimStart('#')
    if ($cleanHex.Length -eq 6) {
        $alphaByte = [Math]::Round($Alpha * 255)
        $alphaHex = "{0:X2}" -f [int]$alphaByte
        return "#$alphaHex$cleanHex"
    }
    return $Hex
}

function Expand-ComputedTokens {
    <#
    .SYNOPSIS
        Expands color tokens into computed RGB, RGBA, and ARGB variants.
    .DESCRIPTION
        Iterates across token keys matching colors.* with 6-digit hex format and synthesizes
        alpha percentage variants (e.g. colors.accent_alpha80) for CSS and XAML templating.
    .PARAMETER Tokens
        Flattened token hashtable to enrich with computed properties.
    .OUTPUTS
        [hashtable] The enriched token dictionary.
    .EXAMPLE
        $tokens = Expand-ComputedTokens -Tokens $rawTokens
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Tokens
    )

    $computedTokens = @{}
    $alphaPercentageSteps = @(5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95)

    foreach ($tokenKey in $Tokens.Keys) {
        $colorValue = [string]$Tokens[$tokenKey]
        if ($tokenKey.StartsWith("colors.") -and $colorValue -match '^#[0-9a-fA-F]{6}$') {
            # Generate rgb representation
            $computedTokens["$tokenKey.rgb"] = Convert-HexToRgb -Hex $colorValue
            
            # Generate alpha variants like colors.accent_alpha80 or colors.accent.alpha80
            foreach ($percentageStep in $alphaPercentageSteps) {
                $alphaRatio = $percentageStep / 100.0
                $computedTokens["${tokenKey}_alpha$percentageStep"] = Convert-HexToRgba -Hex $colorValue -Alpha $alphaRatio
                $computedTokens["$tokenKey.alpha$percentageStep"] = Convert-HexToRgba -Hex $colorValue -Alpha $alphaRatio
                $computedTokens["${tokenKey}_argb$percentageStep"] = Convert-HexToArgbHex -Hex $colorValue -Alpha $alphaRatio
            }
        }
    }

    foreach ($computedKey in $computedTokens.Keys) {
        $Tokens[$computedKey] = $computedTokens[$computedKey]
    }

    return $Tokens
}

function Invoke-TemplateRendering {
    <#
    .SYNOPSIS
        Renders a template file to a target destination by substituting {{token}} markers.
    .DESCRIPTION
        Reads source template UTF-8 text, applies regex token replacement with JSON backslash escaping
        if applicable, performs SHA-256 change detection, and writes to live or shadow target paths.
    .PARAMETER TemplatePath
        Path to source *.template file.
    .PARAMETER OutputPath
        Target destination path for rendered output file.
    .PARAMETER Tokens
        Token lookup hashtable for substitution.
    .PARAMETER DryRun
        Simulates template compilation into shadow sandbox.
    .OUTPUTS
        None.
    .EXAMPLE
        Invoke-TemplateRendering -TemplatePath ".\config.yaml.template" -OutputPath ".\config.yaml" -Tokens $tokens
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$TemplatePath,

        [Parameter(Mandatory = $true)]
        [string]$OutputPath,

        [Parameter(Mandatory = $true)]
        [hashtable]$Tokens,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )

    # In dry-run, template path might be resolved from shadow or live
    $effectiveTemplatePath = if ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun)) {
        Resolve-TargetPath -Path $TemplatePath -Mode "Read"
    } else {
        $TemplatePath
    }

    if (-not (Test-Path -LiteralPath $effectiveTemplatePath)) {
        throw "Template file does not exist: $effectiveTemplatePath"
    }

    $templateContent = [System.IO.File]::ReadAllText($effectiveTemplatePath, [System.Text.Encoding]::UTF8)

    # Replace tokens {{token.name}}
    $tokenRegexPattern = '\{\{([a-zA-Z0-9_\.]+)\}\}'
    $renderedContent = [System.Text.RegularExpressions.Regex]::Replace($templateContent, $tokenRegexPattern, {
        param($regexMatch)
        $tokenName = $regexMatch.Groups[1].Value
        $substitutedValue = $null
        if ($Tokens.ContainsKey($tokenName)) {
            $substitutedValue = [string]$Tokens[$tokenName]
        }
        else {
            Write-Warning "Unresolved token '{{$tokenName}}' in $effectiveTemplatePath; applying fallback default."
            $fallbacks = @{
                "border_enabled"                       = "true"
                "round_corners"                        = "true"
                "window_gap"                           = "8"
                "border_radius"                        = "8"
                "border_width"                         = "2"
                "bar_height"                           = "32"
                "border_style"                         = "rounded"
                "border_implementation"                = "Komorebi"
                "unmanaged_window_operation_behaviour" = "Op"
                "window_hiding_behaviour"              = "Cloak"
                "backdrop"                             = "None"
                "animation_speed"                      = "Fast"
                "search_window_effect"                 = "None"
                "font_family"                          = "JetBrainsMono Nerd Font"
                "font_size_md"                         = "13px"
                "variant"                              = "dark"
                "colors.accent"                        = "#7aa2f7"
                "colors.bg_primary"                    = "#1a1b26"
                "colors.fg_primary"                    = "#c0caf5"
                "colors.background"                    = "#1a1b26"
                "colors.foreground"                    = "#c0caf5"
            }
            if ($fallbacks.ContainsKey($tokenName)) {
                $substitutedValue = $fallbacks[$tokenName]
            } elseif ($tokenName.EndsWith("_enabled") -or $tokenName.StartsWith("use_")) {
                $substitutedValue = "false"
            } elseif ($tokenName.EndsWith("_duration") -or $tokenName.EndsWith("_duration_ms") -or $tokenName.EndsWith("_ms")) {
                $substitutedValue = "0ms"
            } elseif ($tokenName.EndsWith("_width") -or $tokenName.EndsWith("_gap")) {
                $substitutedValue = "0"
            } else {
                $substitutedValue = ""
            }
        }

        # If target is JSON, escape backslashes and double quotes so tokens do not produce invalid JSON escape sequences
        if ($OutputPath.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
            if ($substitutedValue.Contains('\')) {
                $substitutedValue = $substitutedValue.Replace('\', '\\')
            }
            if ($substitutedValue.Contains('"')) {
                $substitutedValue = $substitutedValue.Replace('"', '\"')
            }
        }
        return $substitutedValue
    })

    # Dry-run interception
    if ((Get-Command "Test-IsDryRun" -ErrorAction SilentlyContinue) -and (Test-IsDryRun)) {
        $effectiveOutputPath = Resolve-TargetPath -Path $OutputPath -Mode "Write"
        $outputDirectory = Split-Path -Parent $effectiveOutputPath
        if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
            [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
        }

        # Check if virtual target exists and compare SHA-256 to avoid unnecessary I/O
        $renderedBytes = [System.Text.Encoding]::UTF8.GetBytes($renderedContent)
        $shaHasher = [System.Security.Cryptography.SHA256]::Create()
        $renderedHashBytes = $shaHasher.ComputeHash($renderedBytes)
        $renderedHash = ($renderedHashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

        $existingHash = $null
        if ([System.IO.File]::Exists($effectiveOutputPath)) {
            if (Get-Command "Get-Sha256Hash" -ErrorAction SilentlyContinue) {
                $existingHash = Get-Sha256Hash -Path $effectiveOutputPath
            }
        }

        if ($existingHash -and ($existingHash -eq $renderedHash)) {
            Write-Host "[SKIPPED - UNCHANGED] $TemplatePath -> $OutputPath (Virtual: $effectiveOutputPath)"
            return
        }

        # Write rendered file into shadow root
        [System.IO.File]::WriteAllText($effectiveOutputPath, $renderedContent, [System.Text.UTF8Encoding]::new($false))
        Invoke-SystemAction -ActionType "FileWrite" -Target $OutputPath -Metadata @{
            templatePath = $TemplatePath
            virtualPath = $effectiveOutputPath
            livePath = $OutputPath
        }
        Write-Host "[DRYRUN] Rendered $TemplatePath -> $OutputPath (Virtual: $effectiveOutputPath)"
        return
    }

    if ($DryRun) {
        Write-Host "[DRYRUN] Rendered $TemplatePath -> $OutputPath"
        return
    }

    # Live execution: compute SHA-256 hash vs target file. If unchanged, skip disk I/O.
    $renderedBytes = [System.Text.Encoding]::UTF8.GetBytes($renderedContent)
    $shaHasher = [System.Security.Cryptography.SHA256]::Create()
    $renderedHashBytes = $shaHasher.ComputeHash($renderedBytes)
    $renderedHash = ($renderedHashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

    $existingHash = $null
    if ([System.IO.File]::Exists($OutputPath)) {
        if (Get-Command "Get-Sha256Hash" -ErrorAction SilentlyContinue) {
            $existingHash = Get-Sha256Hash -Path $OutputPath
        }
        else {
            $targetStream = [System.IO.File]::OpenRead($OutputPath)
            try {
                $targetHashBytes = $shaHasher.ComputeHash($targetStream)
                $existingHash = ($targetHashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
            }
            finally {
                $targetStream.Dispose()
            }
        }
    }

    if ($existingHash -and ($existingHash -eq $renderedHash)) {
        Write-Host "[SKIPPED - UNCHANGED] $TemplatePath -> $OutputPath"
        return
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
    }

    [System.IO.File]::WriteAllText($OutputPath, $renderedContent, [System.Text.UTF8Encoding]::new($false))
    Write-Verbose "Rendered template $TemplatePath to $OutputPath"
}

Export-ModuleMember -Function `
    Get-FlattenedTokens, `
    Convert-HexToRgba, `
    Convert-HexToRgb, `
    Convert-HexToArgbHex, `
    Expand-ComputedTokens, `
    Invoke-TemplateRendering
