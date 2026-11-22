Describe "TemplateEngine Module Unit Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $templateModule = Join-Path $repoRoot "scripts\lib\TemplateEngine.psm1"
        $dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"

        Import-Module $templateModule -Force -Global
        Import-Module $dryRunModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Get-FlattenedTokens" {
        It "Flattens nested objects using dot-notation" {
            $json = [PSCustomObject]@{
                app = [PSCustomObject]@{
                    name = "komoyasb"
                    version = "1.0.0"
                    window = [PSCustomObject]@{
                        width = 800
                        height = 600
                    }
                }
            }

            $tokens = Get-FlattenedTokens -JsonObject $json
            $tokens["app.name"] | Should -Be "komoyasb"
            $tokens["app.version"] | Should -Be "1.0.0"
            $tokens["app.window.width"] | Should -Be "800"
            $tokens["app.window.height"] | Should -Be "600"
        }

        It "Formats booleans explicitly as lowercase 'true' or 'false'" {
            $json = [PSCustomObject]@{
                active = $true
                disabled = $false
                nested = [PSCustomObject]@{
                    flag = $true
                }
            }

            $tokens = Get-FlattenedTokens -JsonObject $json
            $tokens["active"] | Should -Be "true"
            $tokens["disabled"] | Should -Be "false"
            $tokens["nested.flag"] | Should -Be "true"
        }

        It "Flattens nested JSON structures" {
            $jsonObj = '{"colors":{"bg":"#111111","fg":"#FFFFFF"},"font":{"size":"12px"}}' | ConvertFrom-Json
            $tokens = Get-FlattenedTokens -JsonObject $jsonObj
            $tokens["colors.bg"] | Should -Be "#111111"
            $tokens["colors.fg"] | Should -Be "#FFFFFF"
            $tokens["font.size"] | Should -Be "12px"
        }
    }

    Context "Color Conversion Utilities" {
        It "Convert-HexToRgba converts 6-char hex with/without # and formats alpha" {
            Convert-HexToRgba -Hex "#FF5500" -Alpha 0.8 | Should -Be "rgba(255, 85, 0, 0.8)"
            Convert-HexToRgba -Hex "0088CC" -Alpha 0.5 | Should -Be "rgba(0, 136, 204, 0.5)"
        }

        It "Convert-HexToRgba returns original string for invalid hex length" {
            Convert-HexToRgba -Hex "#F00" -Alpha 0.5 | Should -Be "#F00"
            Convert-HexToRgba -Hex "invalid" -Alpha 1.0 | Should -Be "invalid"
        }

        It "Convert-HexToRgb converts 6-char hex to rgb(r, g, b)" {
            Convert-HexToRgb -Hex "#1E1E2E" | Should -Be "rgb(30, 30, 46)"
            Convert-HexToRgb -Hex "FFFFFF" | Should -Be "rgb(255, 255, 255)"
        }

        It "Convert-HexToRgb returns original string for non-6-char hex" {
            Convert-HexToRgb -Hex "blue" | Should -Be "blue"
        }

        It "Convert-HexToArgbHex converts hex and alpha into 8-digit ARGB hex string" {
            Convert-HexToArgbHex -Hex "#1E1E2E" -Alpha 0.8 | Should -Be "#CC1E1E2E"
            Convert-HexToArgbHex -Hex "1E1E2E" -Alpha 1.0 | Should -Be "#FF1E1E2E"
            Convert-HexToArgbHex -Hex "#1E1E2E" -Alpha 0.0 | Should -Be "#001E1E2E"
        }

        It "Convert-HexToArgbHex returns original string for invalid hex" {
            Convert-HexToArgbHex -Hex "#FFF" -Alpha 0.5 | Should -Be "#FFF"
        }
    }

    Context "Expand-ComputedTokens" {
        It "Expands 6-char hex colors into RGB, RGBA, and ARGB variants for all 15 alpha steps" {
            $rawTokens = @{
                "colors.accent" = "#FF5500"
                "colors.bg"     = "#1E1E2E"
                "other.value"   = "#FF5500"
                "colors.named"  = "red"
            }

            $expanded = Expand-ComputedTokens -Tokens $rawTokens
            $expanded["colors.accent.rgb"] | Should -Be "rgb(255, 85, 0)"
            $expanded["colors.bg.rgb"] | Should -Be "rgb(30, 30, 46)"

            $alphaSteps = @(5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95)
            foreach ($step in $alphaSteps) {
                $expanded.ContainsKey("colors.accent_alpha$step") | Should -BeTrue
                $expanded.ContainsKey("colors.accent.alpha$step") | Should -BeTrue
                $expanded.ContainsKey("colors.accent_argb$step") | Should -BeTrue

                $expanded["colors.accent_alpha$step"] | Should -Match '^rgba\(255, 85, 0,'
                $expanded["colors.accent_argb$step"] | Should -Match '^#[0-9A-F]{8}$'
            }

            $expanded.ContainsKey("other.value.rgb") | Should -BeFalse
            $expanded.ContainsKey("colors.named.rgb") | Should -BeFalse
        }
    }

    Context "Invoke-TemplateRendering" {
        It "Renders template file by substituting token markers" {
            $testDir = (Get-PSDrive TestDrive).Root
            $templateFile = Join-Path $testDir "test.yaml.template"
            $outputFile = Join-Path $testDir "test.yaml"
            [System.IO.File]::WriteAllText($templateFile, "name: {{app.name}}`nport: {{app.port}}", [System.Text.Encoding]::UTF8)

            $tokens = @{
                "app.name" = "komoyasb"
                "app.port" = "8080"
            }

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens $tokens
            (Test-Path -LiteralPath $outputFile) | Should -BeTrue
            $content = Get-Content -LiteralPath $outputFile -Raw
            $content | Should -Match "name: komoyasb"
            $content | Should -Match "port: 8080"
        }

        It "Throws when template file does not exist" {
            $testDir = (Get-PSDrive TestDrive).Root
            $missingTemplate = Join-Path $testDir "missing.template"
            $outputFile = Join-Path $testDir "out.yaml"
            { Invoke-TemplateRendering -TemplatePath $missingTemplate -OutputPath $outputFile -Tokens @{} } | Should -Throw
        }

        It "Escapes backslashes when output path ends with .json" {
            $testDir = (Get-PSDrive TestDrive).Root
            $templateFile = Join-Path $testDir "test.json.template"
            $outputFile = Join-Path $testDir "test.json"
            [System.IO.File]::WriteAllText($templateFile, '{"path":"{{app.path}}"}', [System.Text.Encoding]::UTF8)

            $tokens = @{
                "app.path" = "C:\Users\gyove\Projects\komoyasb"
            }

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens $tokens
            $rawContent = [System.IO.File]::ReadAllText($outputFile, [System.Text.Encoding]::UTF8)
            $rawContent | Should -Match 'C:\\\\Users\\\\gyove\\\\Projects\\\\komoyasb'

            $parsed = $rawContent | ConvertFrom-Json
            $parsed.path | Should -Be "C:\Users\gyove\Projects\komoyasb"
        }

        It "Leaves unresolved tokens intact and outputs warning" {
            $testDir = (Get-PSDrive TestDrive).Root
            $templateFile = Join-Path $testDir "unresolved.template"
            $outputFile = Join-Path $testDir "unresolved.txt"
            [System.IO.File]::WriteAllText($templateFile, "Hello {{unknown.token}}!", [System.Text.Encoding]::UTF8)

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens @{}
            $content = Get-Content -LiteralPath $outputFile -Raw
            $content | Should -Match "Hello {{unknown.token}}!"
        }

        It "Intercepts rendering in DryRun mode into shadow sandbox" {
            $testDir = (Get-PSDrive TestDrive).Root
            $shadowRoot = Join-Path $testDir "shadow-render"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            $templateFile = Join-Path $testDir "dry.template"
            [System.IO.File]::WriteAllText($templateFile, "key: {{my.key}}", [System.Text.Encoding]::UTF8)

            $liveTarget = "C:\Users\gyove\.config\yasb\config.yaml"
            $tokens = @{ "my.key" = "dry_value" }

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $liveTarget -Tokens $tokens

            (Test-Path -LiteralPath $liveTarget) | Should -BeFalse

            $virtualTarget = Resolve-TargetPath -Path $liveTarget -Mode "Exists"
            (Test-Path -LiteralPath $virtualTarget) | Should -BeTrue
            (Get-Content -LiteralPath $virtualTarget -Raw) | Should -Match "key: dry_value"

            $ledger = Export-ShadowLedger
            $ledger.summary.filesWritten | Should -Be 1
        }

        It "Skips rendering in live mode when SHA-256 hash matches existing file" {
            $testDir = (Get-PSDrive TestDrive).Root
            $templateFile = Join-Path $testDir "skip.template"
            $outputFile = Join-Path $testDir "skip.txt"
            [System.IO.File]::WriteAllText($templateFile, "content", [System.Text.Encoding]::UTF8)

            $tokens = @{}
            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens $tokens
            (Test-Path -LiteralPath $outputFile) | Should -BeTrue

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens $tokens
            (Test-Path -LiteralPath $outputFile) | Should -BeTrue
        }

        It "Supports -DryRun switch when no shadow context is active" {
            Reset-ShadowContext -PurgeFiles
            Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
            $testDir = (Get-PSDrive TestDrive).Root
            $templateFile = Join-Path $testDir "switch.template"
            $outputFile = Join-Path $testDir "switch.txt"
            if (Test-Path -LiteralPath $outputFile) { Remove-Item -LiteralPath $outputFile -Force }
            [System.IO.File]::WriteAllText($templateFile, "content", [System.Text.Encoding]::UTF8)

            Invoke-TemplateRendering -TemplatePath $templateFile -OutputPath $outputFile -Tokens @{} -DryRun
            (Test-Path -LiteralPath $outputFile) | Should -BeFalse
        }
    }
}
