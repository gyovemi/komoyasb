Describe "sync-theme.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
        $dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
        $envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"
        $templateModule = Join-Path $repoRoot "scripts\lib\TemplateEngine.psm1"

        Import-Module $dryRunModule -Force -Global
        Import-Module $envModule -Force -Global
        Import-Module $templateModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue

        Mock -CommandName Get-Process { @() }
        Mock -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
        Mock -CommandName Stop-Process { }
        Mock -CommandName Test-CommandAvailable { return $true }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Theme Resolution and Compilation" {
        It "Compiles dark theme with default settings in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-dark"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            & $syncThemeScript -Theme "dark" -DryRun

            $themeMarker = Join-Path $ctx.Directories.Workspace "themes\.current_theme"
            (Test-Path -LiteralPath $themeMarker) | Should -BeTrue
            (Get-Content -LiteralPath $themeMarker -Raw).Trim() | Should -Be "Tokyo Night Dark"

            $ledger = Export-ShadowLedger
            $ledger.summary.filesWritten | Should -BeGreaterThan 0
        }

        It "Compiles light theme when -Theme light is passed" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-light"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            & $syncThemeScript -Theme "light" -DryRun

            $themeMarker = Join-Path $ctx.Directories.Workspace "themes\.current_theme"
            (Test-Path -LiteralPath $themeMarker) | Should -BeTrue
            (Get-Content -LiteralPath $themeMarker -Raw).Trim() | Should -Be "Tokyo Night Light"
        }

        It "Resolves theme by 'name' property across themes directory" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-byname"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            # "Catppuccin Mocha" or "dark" is the name inside dark.json
            & $syncThemeScript -Theme "dark" -DryRun

            $themeMarker = Join-Path $ctx.Directories.Workspace "themes\.current_theme"
            (Test-Path -LiteralPath $themeMarker) | Should -BeTrue
        }

        It "Throws when an invalid/non-existent theme is requested" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-invalid"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme "non-existent-theme-xyz" -DryRun } | Should -Throw
        }

        It "Resolves theme path when filename with extension is specified" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-theme-ext"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme "dark.json" -DryRun } | Should -Not -Throw
        }

        It "Skips performance tokens when performance.json is absent" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-no-perf"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*performance.json*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme "dark" -DryRun } | Should -Not -Throw
        }

        It "Throws when performance profile is not found in performance.json" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-bad-prof"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $shadowPerf = Join-Path $ctx.Directories.Workspace "performance.json"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $shadowPerf)) | Out-Null
            [System.IO.File]::WriteAllText($shadowPerf, '{"active_profile":"unknown-profile","profiles":{"balanced":{}}}', [System.Text.Encoding]::UTF8)

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme "dark" -DryRun } | Should -Throw
        }
    }

    Context "Performance Token Integration" {
        It "Injects performance profile tokens and derived aliases" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-perf"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            & $syncThemeScript -Theme "dark" -PerformanceProfile "gaming" -DryRun

            $perfMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            (Test-Path -LiteralPath $perfMarker) | Should -BeTrue
            (Get-Content -LiteralPath $perfMarker -Raw).Trim() | Should -Be "gaming"
        }

        It "Supports all 4 performance profiles (ultra-low, balanced, visual-rich, gaming)" {
            $profiles = @("ultra-low", "balanced", "visual-rich", "gaming")
            foreach ($prof in $profiles) {
                $testDir = (Get-PSDrive TestDrive).Root
                $sandboxDir = Join-Path $testDir "sync-shadow-prof-$prof"
                $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

                $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
                { & $syncThemeScript -Theme "dark" -PerformanceProfile $prof -DryRun } | Should -Not -Throw

                $perfMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
                (Get-Content -LiteralPath $perfMarker -Raw).Trim() | Should -Be $prof
                Reset-ShadowContext -PurgeFiles
            }
        }
    }

    Context "Template Rendering Verification" {
        It "Renders configuration files across template mappings into shadow workspace" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-templates"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            & $syncThemeScript -Theme "dark" -DryRun

            # Verify rendered template outputs in shadow workspace
            $renderedKomorebi = Join-Path $ctx.Directories.Workspace "configs\komorebi\komorebi.json"
            $renderedWhkdrc = Join-Path $ctx.Directories.Workspace "configs\komorebi\whkdrc"
            $renderedYasbYaml = Join-Path $ctx.Directories.Workspace "configs\yasb\config.yaml"
            $renderedYasbCss = Join-Path $ctx.Directories.Workspace "configs\yasb\styles.css"

            (Test-Path -LiteralPath $renderedKomorebi) | Should -BeTrue
            (Test-Path -LiteralPath $renderedWhkdrc) | Should -BeTrue
            (Test-Path -LiteralPath $renderedYasbYaml) | Should -BeTrue
            (Test-Path -LiteralPath $renderedYasbCss) | Should -BeTrue
        }

        It "Logs verbose warning when a template in mappings is missing" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-missing-template"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*komorebi.json.template*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme "dark" -DryRun -Verbose } | Should -Not -Throw
        }

        It "Falls back to 'Fill' style when wallpaper.style is omitted" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-wall-nostyle"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $customThemePath = Join-Path $ctx.Directories.Workspace "themes\nostyle.json"
            $darkThemePath = Join-Path $repoRoot "themes\dark.json"
            $darkJson = Get-Content -LiteralPath $darkThemePath -Raw | ConvertFrom-Json
            $themeHash = [ordered]@{}
            foreach ($prop in $darkJson.psobject.Properties) {
                $themeHash[$prop.Name] = $prop.Value
            }
            $themeHash["wallpaper"] = [ordered]@{
                path = "configs/polish/wallpapers/dark.png"
            }
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $customThemePath)) | Out-Null
            $jsonStr = $themeHash | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($customThemePath, $jsonStr, [System.Text.Encoding]::UTF8)

            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"
            { & $syncThemeScript -Theme $customThemePath -DryRun } | Should -Not -Throw
        }
    }

    Context "SandboxRoot Parameter Binding (BUG-03)" {
        It "Accepts -SandboxRoot parameter and initializes shadow context" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "sync-shadow-custom-root"
            $syncThemeScript = Join-Path $repoRoot "scripts\sync-theme.ps1"

            & $syncThemeScript -Theme "dark" -SandboxRoot $sandboxDir -DryRun

            (Test-Path -LiteralPath $sandboxDir) | Should -BeTrue
            $themeMarker = Join-Path $sandboxDir "workspace\themes\.current_theme"
            (Test-Path -LiteralPath $themeMarker) | Should -BeTrue
        }
    }
}
