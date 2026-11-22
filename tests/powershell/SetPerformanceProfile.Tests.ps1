Describe "Set-PerformanceProfile.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
        $dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
        $envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"

        Import-Module $dryRunModule -Force -Global
        Import-Module $envModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue

        Mock -CommandName Get-Process { @() }
        Mock -CommandName Stop-Process { }
        Mock -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
        Mock -CommandName Test-CommandAvailable { return $true }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Profile Activation Matrix" {
        It "Applies 'gaming' profile in DryRun and updates state markers" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-gaming"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            & $setPerfScript -Profile "gaming" -DryRun

            # Verify shadow performance.json updated
            $shadowPerfFile = Join-Path $ctx.Directories.Workspace "performance.json"
            (Test-Path -LiteralPath $shadowPerfFile) | Should -BeTrue
            $perfConfig = Get-Content -LiteralPath $shadowPerfFile -Raw | ConvertFrom-Json
            $perfConfig.active_profile | Should -Be "gaming"

            # Verify shadow .current_perf marker updated
            $shadowMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            (Test-Path -LiteralPath $shadowMarker) | Should -BeTrue
            (Get-Content -LiteralPath $shadowMarker -Raw).Trim() | Should -Be "gaming"

            $ledger = Export-ShadowLedger
            # Service reload simulation
            $reloads = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $reloads.Count | Should -BeGreaterThan 0
        }

        It "Applies 'ultra-low' profile cleanly in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-ultralow"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            & $setPerfScript -Profile "ultra-low" -DryRun

            $shadowMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            (Get-Content -LiteralPath $shadowMarker -Raw).Trim() | Should -Be "ultra-low"
        }

        It "Applies 'balanced' profile cleanly in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-balanced"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            & $setPerfScript -Profile "balanced" -DryRun

            $shadowMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            (Get-Content -LiteralPath $shadowMarker -Raw).Trim() | Should -Be "balanced"
        }

        It "Applies 'visual-rich' profile cleanly in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-visualrich"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            & $setPerfScript -Profile "visual-rich" -DryRun

            $shadowMarker = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            (Get-Content -LiteralPath $shadowMarker -Raw).Trim() | Should -Be "visual-rich"
        }
    }

    Context "Error Handling & Input Validation" {
        It "Throws when performance.json is missing" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-missing-json"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*performance.json*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            { & $setPerfScript -Profile "balanced" -DryRun } | Should -Throw
        }

        It "Throws when requested profile is not defined in performance.json" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-undefined-prof"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            # Write performance.json without the gaming profile
            $shadowPerfFile = Join-Path $ctx.Directories.Workspace "performance.json"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $shadowPerfFile)) | Out-Null
            [System.IO.File]::WriteAllText($shadowPerfFile, '{"profiles":{"balanced":{}}}', [System.Text.Encoding]::UTF8)

            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            { & $setPerfScript -Profile "gaming" -DryRun } | Should -Throw
        }

        It "Rejects an invalid/unsupported profile string via ValidateSet" {
            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            { & $setPerfScript -Profile "overclock-extreme-9000" -DryRun } | Should -Throw
        }

        It "Supports -WhatIf execution cleanly without modifying live system" {
            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"
            { & $setPerfScript -Profile "balanced" -WhatIf } | Should -Not -Throw
        }
    }

    Context "SandboxRoot Parameter Binding (BUG-03)" {
        It "Accepts -SandboxRoot parameter and forwards to shadow context" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "perf-shadow-custom-root"
            $setPerfScript = Join-Path $repoRoot "scripts\Set-PerformanceProfile.ps1"

            & $setPerfScript -Profile "balanced" -SandboxRoot $sandboxDir -DryRun

            (Test-Path -LiteralPath $sandboxDir) | Should -BeTrue
            $perfMarker = Join-Path $sandboxDir "workspace\themes\.current_perf"
            (Test-Path -LiteralPath $perfMarker) | Should -BeTrue
        }
    }
}
