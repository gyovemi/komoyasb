Describe "Set-OsPerformance.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
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
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Apply OS Performance Tweaks" {
        It "Applies 'gaming' profile tweaks in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-gaming"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Profile "gaming" -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0

            # Verify komorebi AboveNormal and yasb Idle priority simulated
            $komoAction = $actions | Where-Object { $_.target -eq "Priority-komorebi" }
            $komoAction.metadata.PriorityClass | Should -Be "AboveNormal"

            $yasbAction = $actions | Where-Object { $_.target -eq "Priority-yasb" }
            $yasbAction.metadata.PriorityClass | Should -Be "Idle"

            # Animation disabled
            $animAction = $actions | Where-Object { $_.target -eq "WindowsAnimation" }
            $animAction.metadata.Enabled | Should -BeFalse
        }

        It "Applies 'ultra-low' profile tweaks with EcoQoS enabled" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-ultralow"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Profile "ultra-low" -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $ecoActions = @($ledger.actions | Where-Object { $_.metadata.Action -eq "EcoQoS" -and $_.metadata.Enable -eq $true })
            $ecoActions.Count | Should -BeGreaterThan 0

            $animAction = $ledger.actions | Where-Object { $_.target -eq "WindowsAnimation" }
            $animAction.metadata.Enabled | Should -BeFalse
        }

        It "Applies 'visual-rich' profile tweaks with animations enabled" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-visualrich"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Profile "visual-rich" -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $animAction = $ledger.actions | Where-Object { $_.target -eq "WindowsAnimation" }
            $animAction.metadata.Enabled | Should -BeTrue
        }

        It "Applies 'balanced' profile tweaks as fallback when profile is omitted" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-balanced"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0
        }

        It "Applies tweaks when target processes are actively running" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-running-procs"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            # Return a realistic Process object
            $currentProc = [System.Diagnostics.Process]::GetCurrentProcess()
            Mock -CommandName Get-Process {
                return @($currentProc)
            }

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Profile "gaming" -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0
        }

        It "Resolves profile from performance.json active_profile when .current_perf does not exist" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-resolve-perfjson"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*\.current_perf*") { return $false }
                if ($LiteralPath -like "*performance.json*") { return $true }
                return $true
            }

            & $setOsPerfScript -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0
        }

        It "Handles missing performance.json and missing .current_perf falling back to balanced" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-resolve-none"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*\.current_perf*") { return $false }
                if ($LiteralPath -like "*performance.json*") { return $false }
                return $true
            }

            & $setOsPerfScript -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0
        }

        It "Gracefully catches corrupt performance.json and falls back to default profile settings" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-corrupt-json"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            Mock -CommandName Get-Content {
                param($LiteralPath)
                if ($LiteralPath -like "*performance.json*") { return "{ invalid json " }
                return "balanced"
            }

            & $setOsPerfScript -Profile "ultra-low" -Action "Apply" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $actions.Count | Should -BeGreaterThan 0
        }
    }

    Context "Restore OS Performance Defaults" {
        It "Restores normal priorities, clears EcoQoS, and re-enables animations" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "osperf-shadow-restore"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            & $setOsPerfScript -Action "Restore" -DryRun

            $ledger = Export-ShadowLedger
            $actions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })

            # All processes restored to Normal
            $priorityActions = @($actions | Where-Object { $_.metadata.Action -eq "PriorityClass" })
            foreach ($pa in $priorityActions) {
                $pa.metadata.PriorityClass | Should -Be "Normal"
            }

            # EcoQoS cleared
            $ecoActions = @($actions | Where-Object { $_.metadata.Action -eq "EcoQoS" })
            foreach ($ea in $ecoActions) {
                $ea.metadata.Enable | Should -BeFalse
            }

            # Animations re-enabled
            $animAction = $actions | Where-Object { $_.target -eq "WindowsAnimation" }
            $animAction.metadata.Enabled | Should -BeTrue
        }
    }

    Context "Input Validation and Safety" {
        It "Rejects an invalid Action via ValidateSet" {
            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            { & $setOsPerfScript -Action "InvalidAction" -DryRun } | Should -Throw
        }

        It "Rejects an invalid Profile name via ValidateSet" {
            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            { & $setOsPerfScript -Profile "turbo-nuclear" -DryRun } | Should -Throw
        }

        It "Runs cleanly under -WhatIf mode" {
            $setOsPerfScript = Join-Path $repoRoot "scripts\Set-OsPerformance.ps1"
            { & $setOsPerfScript -Action "Restore" -WhatIf } | Should -Not -Throw
        }
    }
}
