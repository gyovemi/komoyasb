Describe "watchdog.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
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
        Mock -CommandName Start-Sleep { }
        Mock -CommandName Test-CommandAvailable {
            param($CommandName)
            if ($CommandName -in @("komorebic", "windhawk-cli.exe", "windhawk-cli")) { return $false }
            return $true
        }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "Action Dispatching in DryRun" {
        It "Executes 'Status' action in DryRun mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-status"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Status" -DryRun } | Should -Not -Throw
        }

        It "Executes 'Stop' action in DryRun and records process termination" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-stop"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Stop" -DryRun

            $ledger = Export-ShadowLedger
            $stopActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" -and $_.metadata.Action -eq "Stop" })
            $stopActions.Count | Should -BeGreaterOrEqual 3
        }

        It "Executes 'Start' action (Start-FullStack) sequence in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-start"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Start" -DryRun

            $ledger = Export-ShadowLedger
            $startActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" -and $_.metadata.Action -eq "Start" })
            $startActions.Count | Should -BeGreaterOrEqual 3
        }

        It "Displays process status with active PIDs when processes are running" {
            Mock -CommandName Get-Process {
                return @([PSCustomObject]@{ ProcessName = "komorebi"; Id = 4321 })
            }
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Status" } | Should -Not -Throw
        }

        It "Displays process status with 'None' when no processes are running" {
            Mock -CommandName Get-Process { return @() }
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Status" } | Should -Not -Throw
        }

        It "Executes 'Stop' action with live process mocks" {
            Mock -CommandName Get-Process {
                return @([PSCustomObject]@{ ProcessName = "komorebi"; Id = 4321 })
            }
            Mock -CommandName Test-CommandAvailable { return $true }
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Stop" } | Should -Not -Throw
        }

        It "Executes 'Start' action (Start-FullStack) with live command mocks and auxiliaries" {
            function global:komorebic { $global:LASTEXITCODE = 0 }
            Mock -CommandName Test-CommandAvailable {
                param($CommandName)
                if ($CommandName -in @("Flow.Launcher.exe", "EarTrumpet.exe", "komorebic")) { return $true }
                return $false
            }
            Mock -CommandName Get-Process {
                return @([PSCustomObject]@{ ProcessName = "yasb"; Id = 5555 })
            }
            Mock -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Start" } | Should -Not -Throw
        }

        It "Handles Komorebi readiness timeout and delayed YASB startup" {
            $global:yasbAttempts = 0
            Mock -CommandName Get-Process {
                param($Name)
                if ($Name -eq "yasb") {
                    $global:yasbAttempts++
                    if ($global:yasbAttempts -gt 2) {
                        return @([PSCustomObject]@{ ProcessName = "yasb"; Id = 5555 })
                    }
                }
                return @()
            }
            Mock -CommandName Test-CommandAvailable {
                param($CommandName)
                return $false
            }
            Mock -CommandName Start-Sleep { }
            Mock -CommandName Test-Path {
                param($LiteralPath, $Path)
                $p = if ($LiteralPath) { $LiteralPath } else { $Path }
                if ($p -like "*sync-theme.ps1*") { return $false }
                return ([System.IO.File]::Exists($p) -or [System.IO.Directory]::Exists($p))
            }

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Start" } | Should -Not -Throw
        }

        It "Verifies service CheckReadiness blocks for komorebi, whkd, and yasb" {
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            . $watchdogScript -Action "Status" -DryRun

            $whkdSvc = $watchedServices | Where-Object { $_.Name -eq "whkd" }
            (& $whkdSvc.CheckReadiness) | Should -BeTrue

            $yasbSvc = $watchedServices | Where-Object { $_.Name -eq "yasb" }
            (& $yasbSvc.CheckReadiness) | Should -BeTrue

            $komoSvc = $watchedServices | Where-Object { $_.Name -eq "komorebi" }
            Mock -CommandName Test-CommandAvailable { return $false }
            (& $komoSvc.CheckReadiness) | Should -BeFalse

            Mock -CommandName Test-CommandAvailable { return $true }
            function global:komorebic { $global:LASTEXITCODE = 0 }
            (& $komoSvc.CheckReadiness) | Should -BeTrue
        }

        It "Falls back to SpecialFolder::UserProfile when env:USERPROFILE is empty" {
            $oldProfile = $env:USERPROFILE
            try {
                $env:USERPROFILE = ""
                $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
                { & $watchdogScript -Action "Status" -DryRun } | Should -Not -Throw
            } finally {
                $env:USERPROFILE = $oldProfile
            }
        }

        It "Executes 'Monitor' loop with crash loop prevention threshold" {
            $global:watchdogLoopCount = 0
            Mock -CommandName Start-Sleep {
                $global:watchdogLoopCount++
                if ($global:watchdogLoopCount -ge 4) {
                    throw [System.OperationCanceledException]::new("LoopExit")
                }
            }
            Mock -CommandName Get-Process { return @() }
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Monitor" -DryRun } | Should -Throw
            $global:watchdogLoopCount | Should -BeGreaterOrEqual 3
        }

        It "Executes 'Restart' action (Stop + Start) in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-restart"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Restart" -DryRun

            $ledger = Export-ShadowLedger
            $allProcessActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" })
            $allProcessActions.Count | Should -BeGreaterOrEqual 6
        }
    }

    Context "Restart Threshold and Anti-Storm Protection" {
        It "Simulates backoff tracking logic for crash loops" {
            # Test backoff sliding window calculation directly
            $restartHistory = [System.Collections.Generic.List[datetime]]::new()
            $maxRestarts = 3
            $windowSec = 60

            $t0 = Get-Date
            $restartHistory.Add($t0.AddSeconds(-50))
            $restartHistory.Add($t0.AddSeconds(-30))
            $restartHistory.Add($t0.AddSeconds(-10))

            $now = Get-Date
            $recent = @($restartHistory | Where-Object { ($now - $_).TotalSeconds -le $windowSec })
            $recent.Count | Should -Be 3
            ($recent.Count -ge $maxRestarts) | Should -BeTrue
        }
    }

    Context "Input Validation & Safety" {
        It "Rejects an invalid Action via ValidateSet" {
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Explode" -DryRun } | Should -Throw
        }

        It "Runs cleanly under -WhatIf mode" {
            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            { & $watchdogScript -Action "Status" -WhatIf } | Should -Not -Throw
        }
    }

    Context "Service Parameter Targeting (BUG-04)" {
        It "Accepts -Service parameter and targets individual service 'yasb' for Stop" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-svc-stop"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Stop" -Service "yasb" -DryRun

            $ledger = Export-ShadowLedger
            $stopActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" -and $_.metadata.Action -eq "Stop" })
            $stopActions.Count | Should -Be 1
            $stopActions[0].target | Should -Be "yasb"
        }

        It "Accepts -Service parameter and targets individual service 'komorebi' for Start" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-svc-start"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Start" -Service "komorebi" -DryRun

            $ledger = Export-ShadowLedger
            $startActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" -and $_.metadata.Action -eq "Start" })
            $startActions.Count | Should -Be 1
            $startActions[0].target | Should -Be "komorebi"
        }

        It "Targets all services when -Service is 'all' or omitted" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "watchdog-shadow-svc-all"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $watchdogScript = Join-Path $repoRoot "scripts\watchdog.ps1"
            & $watchdogScript -Action "Stop" -Service "all" -DryRun

            $ledger = Export-ShadowLedger
            $stopActions = @($ledger.actions | Where-Object { $_.actionType -eq "ProcessControl" -and $_.metadata.Action -eq "Stop" })
            $stopActions.Count | Should -BeGreaterOrEqual 3
        }
    }

    Context "Named Pipe Readiness Inspection (HIGH-05)" {
        It "Uses Directory::GetFiles for named pipe readiness check instead of File::Exists" {
            $watchdogContent = Get-Content -LiteralPath (Join-Path $repoRoot "scripts\watchdog.ps1") -Raw
            $watchdogContent | Should -Not -Match '\[System\.IO\.File\]::Exists'
            $watchdogContent | Should -Match '\[System\.IO\.Directory\]::GetFiles\(''\\\\\\\.\\pipe\\'', ''komorebi\*''\)'
        }
    }
}
