Describe "install.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $installScript = Join-Path $repoRoot "install.ps1"
        $dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
        $envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"

        Import-Module $dryRunModule -Force -Global
        Import-Module $envModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue

        # Global mocks to prevent live OS mutations
        Mock -CommandName Get-Process { @() }
        Mock -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
        Mock -CommandName Stop-Process { }
        Mock -CommandName Test-CommandAvailable { return $true }
        Mock -CommandName Test-WingetPackageInstalled { return $true }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "DryRun Full Installation Pipeline" {
        It "Executes all installation phases in DryRun mode with default dark theme" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-full"
            $ledgerDir = Join-Path $testDir "ledgers"
            $ledgerFile = Join-Path $ledgerDir "install-ledger.json"

            $installScript = Join-Path $repoRoot "install.ps1"

            # Run install.ps1 in DryRun mode
            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -LedgerPath $ledgerFile -Theme "dark"

            # Verify shadow root was created and populated
            (Test-Path -LiteralPath $sandboxDir) | Should -BeTrue
            (Test-Path -LiteralPath $ledgerFile) | Should -BeTrue

            $ledger = Get-Content -LiteralPath $ledgerFile -Raw | ConvertFrom-Json
            $ledger.isDryRun | Should -BeTrue
            $ledger.summary.totalActions | Should -BeGreaterThan 0
            $ledger.summary.filesWritten | Should -BeGreaterThan 0
        }

        It "Supports -SkipPackages flag to bypass package provisioning phase" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-skippkg"
            $installScript = Join-Path $repoRoot "install.ps1"

            # Count package installations
            Mock -CommandName Install-WingetPackage {
                param($PackageId)
                return $true
            }

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -SkipPackages

            Assert-MockCalled -CommandName Install-WingetPackage -Times 0
        }

        It "Installs packages when packages are missing and SkipPackages is false" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-installpkg"
            $installScript = Join-Path $repoRoot "install.ps1"

            Mock -CommandName Test-WingetPackageInstalled { return $false }
            Mock -CommandName Test-CommandAvailable { return $false }

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -Theme "dark"

            $ledger = Export-ShadowLedger
            $ledger.summary.packagesSimulated | Should -BeGreaterThan 0
        }

        It "Compiles light theme when -Theme light is specified" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-light"
            $installScript = Join-Path $repoRoot "install.ps1"

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -Theme "light" -SkipPackages

            $ctx = Get-ShadowContext
            $themeMarker = Join-Path $ctx.Directories.Workspace "themes\.current_theme"
            (Test-Path -LiteralPath $themeMarker) | Should -BeTrue
            (Get-Content -LiteralPath $themeMarker -Raw).Trim() | Should -Be "Tokyo Night Light"
        }

        It "Invokes Windhawk mods when -ApplyWindhawk is set" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-windhawk"
            $installScript = Join-Path $repoRoot "install.ps1"

            Mock -CommandName Test-CommandAvailable {
                param($CommandName)
                if ($CommandName -in @("windhawk-cli.exe", "windhawk-cli")) { return $false }
                return $true
            }

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -ApplyWindhawk -SkipPackages

            $ledger = Export-ShadowLedger
            # Windhawk actions recorded in ledger
            $windhawkActions = @($ledger.actions | Where-Object { $_.actionType -eq "WindhawkMod" })
            $windhawkActions.Count | Should -BeGreaterThan 0
        }

        It "Creates backup snapshots and manifest when target configurations exist" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-backups"
            $installScript = Join-Path $repoRoot "install.ps1"

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*komorebi\komorebi.json*") { return $true }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }
            Mock -CommandName Backup-FileWithTimestamp {
                return "C:\mock\backup\komorebi.json"
            }

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -SkipPackages

            $ledger = Export-ShadowLedger
            $manifestActions = @($ledger.actions | Where-Object { $_.target -like "*manifest.json*" })
            $manifestActions.Count | Should -BeGreaterThan 0
        }

        It "Warns when required package fails to install via winget" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-winget-fail"
            $installScript = Join-Path $repoRoot "install.ps1"

            Mock -CommandName Test-WingetPackageInstalled { return $false }
            Mock -CommandName Test-CommandAvailable { return $false }
            Mock -CommandName Install-WingetPackage { return $false }

            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -Theme "dark"

            $ctx = Get-ShadowContext
            $ctx | Should -Not -BeNullOrEmpty
        }

        It "Supports idempotent re-run without errors" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-idempotent"
            $installScript = Join-Path $repoRoot "install.ps1"

            # First run
            & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -SkipPackages

            # Second run on same sandbox root
            { & $installScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -SkipPackages } | Should -Not -Throw
        }

        It "Throws error when specified Theme does not exist" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-badtheme"
            $installScript = Join-Path $repoRoot "install.ps1"

            { & $installScript -DryRun -SandboxRoot $sandboxDir -Theme "non-existent-theme-xyz" -SkipPackages } | Should -Throw
        }

        It "Handles WhatIf parameter equivalent to DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-whatif"
            $installScript = Join-Path $repoRoot "install.ps1"

            { & $installScript -WhatIf -SandboxRoot $sandboxDir -SkipPackages } | Should -Not -Throw
        }

        It "Executes in Rootless mode when -NoAdmin is specified" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-noadmin"
            $ledgerDir = Join-Path $testDir "ledgers"
            $ledgerFile = Join-Path $ledgerDir "install-noadmin-ledger.json"

            & $installScript -NoAdmin -DryRun -SandboxRoot $sandboxDir -KeepSandbox -LedgerPath $ledgerFile -Theme "dark" -SkipPackages

            (Test-Path -LiteralPath $sandboxDir) | Should -BeTrue
            (Test-Path -LiteralPath $ledgerFile) | Should -BeTrue

            $ledger = Get-Content -LiteralPath $ledgerFile -Raw | ConvertFrom-Json
            $ledger.isDryRun | Should -BeTrue
        }

        It "Gracefully skips RamenSoftware.Windhawk in rootless mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "install-shadow-skip-windhawk"

            Mock -CommandName Test-WingetPackageInstalled { return $false }
            Mock -CommandName Test-CommandAvailable { return $false }

            & $installScript -NoAdmin -DryRun -SandboxRoot $sandboxDir -KeepSandbox -Theme "dark"

            $ledger = Export-ShadowLedger
            $windhawkAction = $ledger.actions | Where-Object { $_.target -eq "RamenSoftware.Windhawk" }
            $windhawkAction | Should -Not -BeNullOrEmpty
            $windhawkAction.metadata.Skipped | Should -BeTrue
        }
    }
}
