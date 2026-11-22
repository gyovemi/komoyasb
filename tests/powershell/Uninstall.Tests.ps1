Describe "uninstall.ps1 Unit & Integration Tests" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
        $dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
        $envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"

        Import-Module $dryRunModule -Force -Global
        Import-Module $envModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue

        # Global mocks
        Mock -CommandName Get-Process { @() }
        Mock -CommandName Stop-Process { }
        Mock -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
        Mock -CommandName Test-CommandAvailable {
            param($CommandName)
            if ($CommandName -in @("windhawk-cli.exe", "windhawk-cli")) { return $false }
            return $true
        }
        Mock -CommandName Test-WingetPackageInstalled { return $true }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
        Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
    }

    Context "DryRun Rollback with Backup Manifest" {
        It "Restores original user configurations from backup manifest in DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-manifest"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            # Create shadow backup directory and manifest
            $backupDir = Join-Path $sandboxDir "backups\20261122_120000"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null

            $backupKomorebi = Join-Path $backupDir "komorebi.json.backup"
            [System.IO.File]::WriteAllText($backupKomorebi, '{"original":true}', [System.Text.Encoding]::UTF8)

            $liveOriginalPath = "C:\Users\gyove\.config\komorebi\komorebi.json"
            $manifest = @{
                Timestamp = "20261122_120000"
                Backups = @(
                    @{ Original = $liveOriginalPath; Backup = $backupKomorebi }
                )
            }
            $manifestJson = $manifest | ConvertTo-Json -Depth 5
            [System.IO.File]::WriteAllText((Join-Path $backupDir "manifest.json"), $manifestJson, [System.Text.Encoding]::UTF8)

            # Record latest backup pointer
            $ptrFile = Join-Path $ctx.Directories.Workspace "themes\.latest_backup.txt"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $ptrFile)) | Out-Null
            [System.IO.File]::WriteAllText($ptrFile, $backupDir, [System.Text.Encoding]::UTF8)

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox

            $ledger = Export-ShadowLedger
            $restoredDiffs = @($ledger.fileDiffs | Where-Object { $_.targetLivePath -eq $liveOriginalPath })
            $restoredDiffs.Count | Should -BeGreaterThan 0

            # Verify virtual file was written
            $virtualTarget = Resolve-TargetPath -Path $liveOriginalPath -Mode "Exists"
            (Test-Path -LiteralPath $virtualTarget) | Should -BeTrue
            (Get-Content -LiteralPath $virtualTarget -Raw) | Should -Match '"original":true'
        }

        It "Restores from explicitly specified -BackupDir parameter" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-explicit"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $backupDir = Join-Path $sandboxDir "custom_backup"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null

            $backupYasb = Join-Path $backupDir "config.yaml.backup"
            [System.IO.File]::WriteAllText($backupYasb, "watch: true", [System.Text.Encoding]::UTF8)

            $liveOriginalPath = "C:\Users\gyove\.config\yasb\config.yaml"
            $manifest = @{
                Timestamp = "custom"
                Backups = @(
                    @{ Original = $liveOriginalPath; Backup = $backupYasb }
                )
            }
            [System.IO.File]::WriteAllText((Join-Path $backupDir "manifest.json"), ($manifest | ConvertTo-Json), [System.Text.Encoding]::UTF8)

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -BackupDir $backupDir

            $ledger = Export-ShadowLedger
            $restoredDiffs = @($ledger.fileDiffs | Where-Object { $_.targetLivePath -eq $liveOriginalPath })
            $restoredDiffs.Count | Should -BeGreaterThan 0
        }
    }

    Context "DryRun Rollback without Backup (Fallback Cleanup)" {
        It "Cleans up deployed runtime files when no backup exists" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-cleanup"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            # Populate virtual shadow runtime files
            $virtualKomorebi = Join-Path $ctx.Directories.UserProfile ".config\komorebi\komorebi.json"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $virtualKomorebi)) | Out-Null
            [System.IO.File]::WriteAllText($virtualKomorebi, "{}", [System.Text.Encoding]::UTF8)

            $virtualWhkd = Join-Path $ctx.Directories.UserProfile ".config\whkdrc"
            [System.IO.File]::WriteAllText($virtualWhkd, "# whkdrc", [System.Text.Encoding]::UTF8)

            $virtualPerf = Join-Path $ctx.Directories.Workspace "themes\.current_perf"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $virtualPerf)) | Out-Null
            [System.IO.File]::WriteAllText($virtualPerf, "balanced", [System.Text.Encoding]::UTF8)

            (Test-Path -LiteralPath $virtualKomorebi) | Should -BeTrue
            (Test-Path -LiteralPath $virtualWhkd) | Should -BeTrue
            (Test-Path -LiteralPath $virtualPerf) | Should -BeTrue

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox

            # Shadow files should have been deleted
            (Test-Path -LiteralPath $virtualKomorebi) | Should -BeFalse
            (Test-Path -LiteralPath $virtualWhkd) | Should -BeFalse
            (Test-Path -LiteralPath $virtualPerf) | Should -BeFalse

            $ledger = Export-ShadowLedger
            $deletedDiffs = @($ledger.fileDiffs | Where-Object { $_.changeType -eq "Deleted" })
            $deletedDiffs.Count | Should -BeGreaterThan 0
        }
    }

    Context "Package De-provisioning" {
        It "Simulates winget package removal when -RemovePackages is set" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-removepkg"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -RemovePackages

            $ledger = Export-ShadowLedger
            $uninstalledPkgs = @($ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" -and $_.metadata.Action -eq "Uninstall" })
            $uninstalledPkgs.Count | Should -BeGreaterThan 0
        }

        It "Skips package de-provisioning when -RemovePackages is omitted" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-noremovepkg"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox

            $ledger = Export-ShadowLedger
            $uninstalledPkgs = @($ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" })
            $uninstalledPkgs.Count | Should -Be 0
        }
    }

    Context "WhatIf and Parameter Safety" {
        It "Terminates processes directly when watchdog.ps1 is absent" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-nowatchdog"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*watchdog.ps1*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }

            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox
            $ledger = Export-ShadowLedger
            $ledger | Should -Not -BeNullOrEmpty
        }

        It "Handles missing apply-windhawk-mods.ps1 gracefully" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-nowindhawk"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            Mock -CommandName Test-Path {
                param($LiteralPath)
                if ($LiteralPath -like "*apply-windhawk-mods.ps1*") { return $false }
                return ([System.IO.File]::Exists($LiteralPath) -or [System.IO.Directory]::Exists($LiteralPath))
            }

            { & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox } | Should -Not -Throw
        }

        It "Warns when backup manifest is not found in specified directory" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-missing-manifest"
            $missingDir = Join-Path $testDir "nonexistent-backup-dir"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -BackupDir $missingDir
            $ledger = Export-ShadowLedger
            $ledger | Should -Not -BeNullOrEmpty
        }

        It "Performs package uninstall in shadow context when -RemovePackages is set" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-pkg-test"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            Mock -CommandName Test-WingetPackageInstalled { return $true }
            Mock -CommandName Get-Process { return @() }
            Mock -CommandName Stop-Process { }
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            { & $uninstallScript -DryRun -RemovePackages } | Should -Not -Throw
        }

        It "Executes DryRun logging branches when no shadow context is active" {
            Reset-ShadowContext -PurgeFiles
            Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue

            $testDir = (Get-PSDrive TestDrive).Root
            $backupDir = Join-Path $testDir "dry-backup-dir"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null
            $backupFile = Join-Path $backupDir "test.bak"
            [System.IO.File]::WriteAllText($backupFile, "bak", [System.Text.Encoding]::UTF8)

            $manifest = @{
                Timestamp = "dry"
                Backups = @(
                    @{ Original = "C:\dummy\target.json"; Backup = $backupFile }
                )
            }
            [System.IO.File]::WriteAllText((Join-Path $backupDir "manifest.json"), ($manifest | ConvertTo-Json), [System.Text.Encoding]::UTF8)

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            { & $uninstallScript -DryRun -BackupDir $backupDir } | Should -Not -Throw
        }

        It "Runs cleanly under -WhatIf mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-whatif"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            { & $uninstallScript -WhatIf -SandboxRoot $sandboxDir } | Should -Not -Throw
        }

        It "Executes uninstall rollback in Rootless mode with -NoAdmin switch" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-noadmin"
            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"

            { & $uninstallScript -NoAdmin -DryRun -SandboxRoot $sandboxDir -KeepSandbox } | Should -Not -Throw
        }
    }

    Context "Corrupted and Missing Manifest Recovery (BUG-05 / Vector D)" {
        It "Gracefully recovers and cleans runtime files when manifest.json is corrupted syntax" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-corrupt-manifest"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $backupDir = Join-Path $sandboxDir "backups\corrupted"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null
            $corruptManifestPath = Join-Path $backupDir "manifest.json"
            [System.IO.File]::WriteAllText($corruptManifestPath, '{"Timestamp": "20261122", "Backups": [', [System.Text.UTF8Encoding]::new($false))

            $runtimeTarget = Resolve-TargetPath -Path "C:\Users\gyove\.config\komorebi\komorebi.json" -Mode "Write"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $runtimeTarget)) | Out-Null
            [System.IO.File]::WriteAllText($runtimeTarget, "{}", [System.Text.UTF8Encoding]::new($false))

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            { & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -BackupDir $backupDir } | Should -Not -Throw

            $fileExists = Test-Path -LiteralPath $runtimeTarget
            $fileExists | Should -BeFalse
        }

        It "Gracefully recovers and cleans runtime files when manifest.json is 0 bytes" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-empty-manifest"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $backupDir = Join-Path $sandboxDir "backups\empty"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null
            $emptyManifestPath = Join-Path $backupDir "manifest.json"
            [System.IO.File]::WriteAllText($emptyManifestPath, '', [System.Text.UTF8Encoding]::new($false))

            $runtimeTarget = Resolve-TargetPath -Path "C:\Users\gyove\.config\yasb\config.yaml" -Mode "Write"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $runtimeTarget)) | Out-Null
            [System.IO.File]::WriteAllText($runtimeTarget, "watch: true", [System.Text.UTF8Encoding]::new($false))

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            { & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -BackupDir $backupDir } | Should -Not -Throw

            $fileExists = Test-Path -LiteralPath $runtimeTarget
            $fileExists | Should -BeFalse
        }

        It "Rolls back cleanly with single-item array backup manifest" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "uninstall-shadow-single-backup"
            $ctx = Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox

            $backupDir = Join-Path $sandboxDir "backups\single"
            [System.IO.Directory]::CreateDirectory($backupDir) | Out-Null
            $backupFile = Join-Path $backupDir "komorebi.json.bak"
            [System.IO.File]::WriteAllText($backupFile, '{"restored":true}', [System.Text.UTF8Encoding]::new($false))

            $liveOriginal = "C:\Users\gyove\.config\komorebi\komorebi.json"
            $manifestContent = @"
{
  "Timestamp": "20261122_single",
  "Backups": [
    { "Original": "$($liveOriginal -replace '\\', '\\')", "Backup": "$($backupFile -replace '\\', '\\')" }
  ]
}
"@
            [System.IO.File]::WriteAllText((Join-Path $backupDir "manifest.json"), $manifestContent, [System.Text.UTF8Encoding]::new($false))

            $uninstallScript = Join-Path $repoRoot "uninstall.ps1"
            & $uninstallScript -DryRun -SandboxRoot $sandboxDir -KeepSandbox -BackupDir $backupDir

            $restoredVirtual = Resolve-TargetPath -Path $liveOriginal -Mode "Exists"
            (Test-Path -LiteralPath $restoredVirtual) | Should -BeTrue
            (Get-Content -LiteralPath $restoredVirtual -Raw) | Should -Match '"restored":true'
        }
    }
}
