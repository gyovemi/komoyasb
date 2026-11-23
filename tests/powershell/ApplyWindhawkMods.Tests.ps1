Describe "apply-windhawk-mods.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
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
        Mock -CommandName Test-CommandAvailable {
            param($CommandName)
            if ($CommandName -in @("windhawk-cli.exe", "windhawk-cli")) { return $false }
            return $true
        }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Load Action" {
        It "Stages and loads all mods in DryRun mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-load"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Load" -ModId "All" -DryRun

            $ledger = Export-ShadowLedger
            $modActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" })
            $modActions.Count | Should -BeGreaterThan 0

            # Staged cpp files in shadow ProgramData
            $stagedFiles = @($ledger.actions | Where-Object { $_.actionType -eq "FileWrite" })
            $stagedFiles.Count | Should -BeGreaterThan 0
        }

        It "Loads a single targeted mod (taskbar-autohide)" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-single"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Load" -ModId "taskbar-autohide" -DryRun

            $ledger = Export-ShadowLedger
            $modActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" })
            $modActions.Count | Should -Be 1
            $modActions[0].target | Should -Be "taskbar-autohide"
        }

        It "Configures DWM settings for dwm-mica-effects from performance profile" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-dwm"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Load" -ModId "dwm-mica-effects" -PerformanceProfile "visual-rich" -DryRun

            $ledger = Export-ShadowLedger
            $modActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" })
            # Should have load + settings configure action
            $modActions.Count | Should -BeGreaterThan 1
        }

        It "Skips loading when mod source is already staged with matching SHA-256" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-sha"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"

            # First load stages files
            & $windhawkScript -Action "Load" -ModId "taskbar-autohide" -DryRun
            $ledger1 = Export-ShadowLedger
            $stageCount1 = @($ledger1.actions | Where-Object { $_.actionType -eq "FileWrite" }).Count
            $stageCount1 | Should -Be 1

            # Second load skips staging because SHA-256 matches
            & $windhawkScript -Action "Load" -ModId "taskbar-autohide" -DryRun
            $ledger2 = Export-ShadowLedger
            $stageCount2 = @($ledger2.actions | Where-Object { $_.actionType -eq "FileWrite" }).Count
            $stageCount2 | Should -Be 1
        }
    }

    Context "Unload Action (Rollback)" {
        It "Unloads all mods during rollback in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-unload"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Unload" -ModId "All" -DryRun

            $ledger = Export-ShadowLedger
            $unloadActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" -and $_.metadata.Arguments -like "*-unload-mod*" })
            $unloadActions.Count | Should -Be 3
        }

        It "Unloads a single targeted mod" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-unload-single"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Unload" -ModId "notification-styling" -DryRun

            $ledger = Export-ShadowLedger
            $unloadActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" })
            $unloadActions.Count | Should -Be 1
            $unloadActions[0].target | Should -Be "notification-styling"
        }
    }

    Context "Compile & Status Actions" {
        It "Executes compile action for all mods in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-compile"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Compile" -ModId "All" -DryRun

            $ledger = Export-ShadowLedger
            $compileActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" -and $_.metadata.Arguments -like "*-compile-mod*" })
            $compileActions.Count | Should -Be 3
        }

        It "Executes status query action in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-status"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Status" -DryRun

            $ledger = Export-ShadowLedger
            $statusActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" -and $_.metadata.Arguments -like "*-status*" })
            $statusActions.Count | Should -Be 1
        }
    }

    Context "Validation & Safety" {
        It "Discovers Windhawk CLI path when available via candidate paths" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-candcli"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*windhawk-cli.exe*") { return $true }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Status" -DryRun } | Should -Not -Throw
        }

        It "Discovers Windhawk CLI path via Test-CommandAvailable" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-cmdavail"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-CommandAvailable { return $true }
            Mock -CommandName Get-Command {
                return [PSCustomObject]@{ Source = "C:\mock\windhawk-cli.exe" }
            }
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Status" -DryRun } | Should -Not -Throw
        }

        It "Warns when mod source file is missing" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-missing-src"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*wh.cpp*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Load" -ModId "taskbar-autohide" -DryRun } | Should -Not -Throw
        }

        It "Displays managed mod definitions when CLI not found in Status action without DryRun" {
            Mock -CommandName Test-CommandAvailable { return $false }
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Status" } | Should -Not -Throw
        }

        It "Handles corrupt performance.json gracefully during DWM settings resolve" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-corrupt-perf"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Get-Content {
                param($LiteralPath)
                if ($LiteralPath -like "*performance.json*") { return "{ invalid json " }
                return "balanced"
            }
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Load" -PerformanceProfile "gaming" -DryRun } | Should -Not -Throw
        }

        It "Resolves PerformanceProfile from performance.json when .current_perf is absent" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-perf-resolve"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*\.current_perf*") { return $false }
                if ($LiteralPath -like "*performance.json*") { return $true }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            Mock -CommandName Get-Content {
                param($LiteralPath)
                if ($LiteralPath -like "*performance.json*") {
                    return '{"active_profile":"gaming","profiles":{"gaming":{"dwm":{"backdrop_type":2,"rounded_corners":2,"force_dark_mode":false}}}}'
                }
                return "balanced"
            }

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Load" -ModId "dwm-mica-effects" -DryRun } | Should -Not -Throw
        }

        It "Rejects an invalid Action via ValidateSet" {
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "DestroyAll" -DryRun } | Should -Throw
        }

        It "Rejects an invalid ModId via ValidateSet" {
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -ModId "fake-mod-xyz" -DryRun } | Should -Throw
        }

        It "Runs cleanly under -WhatIf mode" {
            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Status" -WhatIf } | Should -Not -Throw
        }
    }

    Context "Rootless Mode & Native Taskbar Auto-Hide Fallback" {
        It "Activates native StuckRects3 taskbar auto-hide fallback when -NoAdmin is set" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-noadmin"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Load" -NoAdmin -DryRun

            $ledger = Export-ShadowLedger
            $registryActions = @($ledger.actions | Where-Object { 
                $_.actionType -eq "RegistryWrite" -and 
                ($_.target -match "StuckRects3" -or $_.metadata.FullTarget -match "StuckRects3")
            })
            $registryActions.Count | Should -BeGreaterThan 0
            $registryActions[0].metadata.Action | Should -Be "TaskbarAutoHide"
            $registryActions[0].metadata.Enable | Should -BeTrue
        }

        It "Disables native StuckRects3 taskbar auto-hide fallback on Unload in rootless mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-noadmin-unload"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            & $windhawkScript -Action "Unload" -NoAdmin -DryRun

            $ledger = Export-ShadowLedger
            $registryActions = @($ledger.actions | Where-Object { 
                $_.actionType -eq "RegistryWrite" -and 
                ($_.target -match "StuckRects3" -or $_.metadata.FullTarget -match "StuckRects3")
            })
            $registryActions.Count | Should -BeGreaterThan 0
            $registryActions[0].metadata.Enable | Should -BeFalse
        }
    }

    Context "StrictMode PerformanceProfile Property Guard (HIGH-03)" {
        It "Executes cleanly without StrictMode exception when PerformanceProfile is custom or unlisted" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "windhawk-shadow-custom-profile"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $windhawkScript = Join-Path $repoRoot "scripts\apply-windhawk-mods.ps1"
            { & $windhawkScript -Action "Load" -ModId "taskbar-autohide" -PerformanceProfile "nonexistent-profile-xyz" -DryRun } | Should -Not -Throw
        }
    }
}
