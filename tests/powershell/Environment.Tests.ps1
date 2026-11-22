Describe "Environment Module Unit Tests" {
    BeforeAll {
        $script:repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $script:envModule = Join-Path $script:repoRoot "scripts\lib\Environment.psm1"
        $script:dryRunModule = Join-Path $script:repoRoot "scripts\lib\DryRunContext.psm1"

        Import-Module $script:dryRunModule -Force -Global
        Import-Module $script:envModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
        # Reset winget cache variable if defined
        & (Get-Module Environment) { $script:InstalledWingetPackagesCache = $null }
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
    }

    Context "Get-WorkspaceRoot" {
        It "Resolves the repository root by detecting themes and configs directories" {
            $root = Get-WorkspaceRoot
            $root | Should -Not -BeNullOrEmpty
            (Test-Path -LiteralPath (Join-Path $root "themes")) | Should -BeTrue
            (Test-Path -LiteralPath (Join-Path $root "configs")) | Should -BeTrue
        }
    }

    Context "Test-CommandAvailable" {
        It "Returns true for an existing PowerShell command or executable" {
            Test-CommandAvailable -CommandName "Get-Command" | Should -BeTrue
        }

        It "Returns false for a non-existent command" {
            Mock -ModuleName "Environment" Get-Command { return $null }
            Test-CommandAvailable -CommandName "non_existent_command_xyz_987" | Should -BeFalse
        }
    }

    Context "Get-InstalledWingetPackages" {
        It "Returns an empty HashSet when winget is unavailable" {
            Mock -ModuleName "Environment" Test-CommandAvailable { return $false }

            $packages = Get-InstalledWingetPackages -ForceRefresh
            $packages | Should -BeNullOrEmpty
        }

        It "Parses winget list output and populates the cache" {
            Mock -ModuleName "Environment" Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" winget {
                $global:LASTEXITCODE = 0
                return @"
Name                      Id                                Version          Source
-----------------------------------------------------------------------------------
Komorebi                  LGUG2Z.komorebi                   0.1.28           winget
YASB                      AmN.yasb                          1.5.2            winget
Flow Launcher             Flow-Launcher.Flow-Launcher       1.19.4           winget
"@
            }

            $packages = Get-InstalledWingetPackages -ForceRefresh
            $packages | Should -Not -BeNull
            $packages.Contains("LGUG2Z.komorebi") | Should -BeTrue
            $packages.Contains("AmN.yasb") | Should -BeTrue
            $packages.Contains("Flow-Launcher.Flow-Launcher") | Should -BeTrue
            $packages.Contains("non.existent.package") | Should -BeFalse

            # Second call without ForceRefresh uses cache
            $cached = Get-InstalledWingetPackages
            $cached.Contains("LGUG2Z.komorebi") | Should -BeTrue
        }
    }

    Context "Test-WingetPackageInstalled" {
        It "Detects package when binary exists on disk" {
            $tempExe = Join-Path (Get-Location).Path "komorebi_test.exe"
            [System.IO.File]::WriteAllText($tempExe, "dummy binary", [System.Text.Encoding]::UTF8)

            try {
                & (Get-Module Environment) {
                    param($p)
                    $script:KnownPackageBinaryPaths["LGUG2Z.komorebi"] = @($p)
                } $tempExe

                $installed = Test-WingetPackageInstalled -PackageId "LGUG2Z.komorebi"
                $installed | Should -BeTrue
            } finally {
                if (Test-Path -LiteralPath $tempExe) {
                    [System.IO.File]::Delete($tempExe)
                }
            }
        }

        It "Detects package from cached winget list when binary does not exist" {
            $mockSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            [void]$mockSet.Add("LGUG2Z.whkd")
            Mock -ModuleName "Environment" Get-InstalledWingetPackages { return $mockSet }

            $installed = Test-WingetPackageInstalled -PackageId "LGUG2Z.whkd"
            $installed | Should -BeTrue
        }

        It "Returns false when package binary does not exist and is absent from winget cache" {
            $mockSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            Mock -ModuleName "Environment" Get-InstalledWingetPackages { return $mockSet }

            $installed = Test-WingetPackageInstalled -PackageId "Unknown.Package.Random"
            $installed | Should -BeFalse
        }
    }

    Context "Install-WingetPackage" {
        It "Intercepts installation in DryRun and records action into shadow ledger" {
            $shadowRoot = Join-Path $TestDrive "shadow-pkg"
            Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox | Out-Null

            $success = Install-WingetPackage -PackageId "LGUG2Z.komorebi" -CustomSource "custom-repo"
            $success | Should -BeTrue

            $ledger = Export-ShadowLedger
            $ledger.summary.packagesSimulated | Should -Be 1
            $ledger.actions | Should -HaveCount 1
            $ledger.actions[0].actionType | Should -Be "PackageInstall"
            $ledger.actions[0].target | Should -Be "LGUG2Z.komorebi"
            $ledger.actions[0].metadata.CustomSource | Should -Be "custom-repo"
        }

        It "Warns and returns false in live mode if winget is unavailable" {
            Reset-ShadowContext -PurgeFiles
            Mock -ModuleName "Environment" Test-CommandAvailable { return $false }

            $success = Install-WingetPackage -PackageId "LGUG2Z.komorebi"
            $success | Should -BeFalse
        }

        It "Executes live winget installation when winget succeeds" {
            Reset-ShadowContext -PurgeFiles
            Mock -ModuleName "Environment" Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" Start-Process {
                return [PSCustomObject]@{ ExitCode = 0 }
            }

            $success = Install-WingetPackage -PackageId "LGUG2Z.komorebi"
            $success | Should -BeTrue
        }

        It "Returns false when live winget installation returns non-zero error code" {
            Reset-ShadowContext -PurgeFiles
            Mock -ModuleName "Environment" Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" Start-Process {
                return [PSCustomObject]@{ ExitCode = 1603 }
            }

            $success = Install-WingetPackage -PackageId "LGUG2Z.komorebi"
            $success | Should -BeFalse
        }

        It "Catches and returns false when Start-Process throws an exception" {
            Reset-ShadowContext -PurgeFiles
            Mock -ModuleName "Environment" Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" Start-Process {
                throw "Simulated winget invocation exception"
            }

            $success = Install-WingetPackage -PackageId "LGUG2Z.komorebi"
            $success | Should -BeFalse
        }
    }

    Context "New-DirectorySafely" {
        It "Redirects directory creation to shadow root when in DryRun mode" {
            $shadowRoot = Join-Path $TestDrive "shadow-mkdir"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            $targetDir = "C:\Users\gyove\.config\testdir"
            New-DirectorySafely -Path $targetDir

            $virtualDir = Resolve-TargetPath -Path $targetDir -Mode "Write"
            (Test-Path -LiteralPath $virtualDir) | Should -BeTrue

            $ledger = Export-ShadowLedger
            $ledger.actions | Should -HaveCount 1
            $ledger.actions[0].actionType | Should -Be "DirectoryCreate"
        }

        It "Logs dry run when -DryRun switch is passed without active context" {
            Reset-ShadowContext -PurgeFiles
            New-DirectorySafely -Path (Join-Path $TestDrive "dummy-dryrun-dir") -DryRun
        }

        It "Creates directory in live mode when not in dry-run" {
            Reset-ShadowContext -PurgeFiles
            $newDir = Join-Path $TestDrive "live-new-dir"
            (Test-Path -LiteralPath $newDir) | Should -BeFalse

            New-DirectorySafely -Path $newDir
            (Test-Path -LiteralPath $newDir) | Should -BeTrue

            # Re-running on existing directory does not fail
            New-DirectorySafely -Path $newDir
            (Test-Path -LiteralPath $newDir) | Should -BeTrue
        }
    }

    Context "Backup-FileWithTimestamp" {
        It "Returns null when source file does not exist" {
            Reset-ShadowContext -PurgeFiles
            $result = Backup-FileWithTimestamp -SourcePath "C:\non-existent\path.json" -BackupDir (Join-Path $TestDrive "backups")
            $result | Should -BeNullOrEmpty
        }

        It "Backs up file into shadow directory during DryRun" {
            $testDir = (Get-PSDrive TestDrive).Root
            $shadowRoot = Join-Path $testDir "shadow-backup"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            $sourceFile = Join-Path $testDir "source-config.json"
            [System.IO.File]::WriteAllText($sourceFile, '{"config":"active"}', [System.Text.Encoding]::UTF8)

            $backupDir = Join-Path $testDir "backup-target"
            $backupResult = Backup-FileWithTimestamp -SourcePath $sourceFile -BackupDir $backupDir

            $backupResult | Should -Not -BeNullOrEmpty
            (Test-Path -LiteralPath $backupResult) | Should -BeTrue
            $backupResult.StartsWith($shadowRoot, [System.StringComparison]::OrdinalIgnoreCase) | Should -BeTrue

            $ledger = Export-ShadowLedger
            $ledger.summary.filesWritten | Should -Be 1
        }

        It "Logs backup when -DryRun switch is passed without active context" {
            Reset-ShadowContext -PurgeFiles
            $sourceFile = Join-Path $TestDrive "dry-source.json"
            [System.IO.File]::WriteAllText($sourceFile, '{"data":1}', [System.Text.Encoding]::UTF8)

            $backupDir = Join-Path $TestDrive "dry-backup"
            $result = Backup-FileWithTimestamp -SourcePath $sourceFile -BackupDir $backupDir -DryRun
            $result | Should -Be (Join-Path $backupDir "dry-source.json")
        }

        It "Creates timestamped backup file in live mode" {
            Reset-ShadowContext -PurgeFiles
            $sourceFile = Join-Path $TestDrive "live-source.json"
            [System.IO.File]::WriteAllText($sourceFile, '{"live":true}', [System.Text.Encoding]::UTF8)

            $backupDir = Join-Path $TestDrive "live-backups"
            $backupResult = Backup-FileWithTimestamp -SourcePath $sourceFile -BackupDir $backupDir

            $backupResult | Should -Not -BeNullOrEmpty
            (Test-Path -LiteralPath $backupResult) | Should -BeTrue
            $backupResult | Should -Match 'live-source\.json\.backup_\d{8}_\d{6}$'
            (Get-Content -LiteralPath $backupResult -Raw) | Should -Be '{"live":true}'
        }
    }

    Context "Path Helpers (Get-UserConfigDir, Get-AppDataDir, Get-LocalAppDataDir)" {
        It "Resolves standard config directories redirected to shadow in DryRun" {
            $shadowRoot = Join-Path $TestDrive "shadow-paths"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            $userConfig = Get-UserConfigDir -SubPath "komorebi"
            $userConfig.StartsWith($ctx.Directories.UserProfile) | Should -BeTrue
            $userConfig.EndsWith(".config\komorebi") | Should -BeTrue

            $appData = Get-AppDataDir -SubPath "FlowLauncher"
            $appData.StartsWith($ctx.Directories.AppData) | Should -BeTrue
            $appData.EndsWith("FlowLauncher") | Should -BeTrue

            $localAppData = Get-LocalAppDataDir -SubPath "komorebi"
            $localAppData.StartsWith($ctx.Directories.LocalAppData) | Should -BeTrue
            $localAppData.EndsWith("komorebi") | Should -BeTrue
        }

        It "Resolves standard config directories to host paths when DryRun is false" {
            Reset-ShadowContext -PurgeFiles

            $userConfig = Get-UserConfigDir -SubPath "komorebi"
            $userConfig.EndsWith(".config\komorebi") | Should -BeTrue

            $appData = Get-AppDataDir -SubPath "FlowLauncher"
            $appData.EndsWith("FlowLauncher") | Should -BeTrue

            $localAppData = Get-LocalAppDataDir -SubPath "komorebi"
            $localAppData.EndsWith("komorebi") | Should -BeTrue

            # Subpath empty branch via InModuleScope
            InModuleScope "Environment" {
                $baseOnly = Resolve-StandardPath -Base "C:\test" -SubPath ""
                $baseOnly | Should -Be "C:\test"
            }
        }

        It "Handles winget snapshot failure and populates empty cache" {
            Mock -ModuleName "Environment" -CommandName Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" -CommandName Start-Process { throw "winget failure" }
            $packages = Get-InstalledWingetPackages -ForceRefresh
            $packages.Count | Should -Be 0
        }

        It "Installs package in live mock mode with CustomSource" {
            Reset-ShadowContext -PurgeFiles
            Mock -ModuleName "Environment" -CommandName Test-CommandAvailable { return $true }
            Mock -ModuleName "Environment" -CommandName Start-Process { return [PSCustomObject]@{ ExitCode = 0 } }
            $res = Install-WingetPackage -PackageId "9N45NSM4TNBP" -CustomSource "msstore"
            $res | Should -BeTrue
        }
    }

    Context "Test-IsAdministrator" {
        It "Returns a boolean privilege status without throwing" {
            $isAdmin = Test-IsAdministrator
            ($isAdmin -eq $true -or $isAdmin -eq $false) | Should -BeTrue
        }
    }

    Context "Install-WingetPackage Rootless & Scoping" {
        It "Includes --scope user in simulated winget install command" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "env-shadow-scope"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $installed = Install-WingetPackage -PackageId "LGUG2Z.komorebi" -DryRun
            $installed | Should -BeTrue

            $ledger = Export-ShadowLedger
            $pkgAction = $ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" -and $_.target -eq "LGUG2Z.komorebi" }
            $pkgAction | Should -Not -BeNullOrEmpty
            $pkgAction.metadata.Scope | Should -Be "user"
            $pkgAction.metadata.Command | Should -Match "--scope user"
        }

        It "Gracefully skips machine-only package RamenSoftware.Windhawk in NoAdmin mode" {
            $testDir = (Get-PSDrive TestDrive).Root
            $sandboxDir = Join-Path $testDir "env-shadow-skip"
            Initialize-ShadowContext -ShadowRoot $sandboxDir -KeepSandbox | Out-Null

            $installed = Install-WingetPackage -PackageId "RamenSoftware.Windhawk" -NoAdmin -DryRun
            $installed | Should -BeTrue

            $ledger = Export-ShadowLedger
            $skipAction = $ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" -and $_.target -eq "RamenSoftware.Windhawk" }
            $skipAction | Should -Not -BeNullOrEmpty
            $skipAction.metadata.Skipped | Should -BeTrue
            $skipAction.metadata.Reason | Should -Be "RootlessMode"
        }
    }

    Context "Single-Element Array JSON Serialization (BUG-06)" {
        It "Serializes single-element arrays as JSON array brackets rather than unwrapped object" {
            $singleArr = @(@{ Original = "C:\test\komorebi.json"; Backup = "C:\test\komorebi.json.bak" })
            $manifest = @{
                Timestamp = "20261122_120000"
                Backups = $singleArr
            }
            $json = ConvertTo-JsonSafe -InputObject $manifest -Depth 5
            $json | Should -Match '"Backups"\s*:\s*\['
            $parsed = $json | ConvertFrom-Json
            @($parsed.Backups).Count | Should -Be 1
        }

        It "Preserves array structure for standalone single-element arrays" {
            $arr = @("LGUG2Z.komorebi")
            $json = ConvertTo-JsonSafe -InputObject $arr -AsArray
            $json.Trim().StartsWith("[") | Should -BeTrue
            $json.Trim().EndsWith("]") | Should -BeTrue
        }
    }

    Context "Unicode and Square Bracket Path Resiliency (Chaos Vector A)" {
        It "Handles paths containing square brackets [Build] without wildcard expansion failures" {
            $tempBase = [System.IO.Path]::GetTempPath()
            $bracketDir = Join-Path $tempBase "Test[Build]Path"
            [System.IO.Directory]::CreateDirectory($bracketDir) | Out-Null
            try {
                $testFile = Join-Path $bracketDir "config[test].json"
                [System.IO.File]::WriteAllText($testFile, '{"test":true}', [System.Text.UTF8Encoding]::new($false))

                (Test-Path -LiteralPath $testFile) | Should -BeTrue
                $hash = Get-Sha256Hash -Path $testFile
                $hash | Should -Not -BeNullOrEmpty

                $ctx = Initialize-ShadowContext -KeepSandbox
                $resolved = Resolve-TargetPath -Path $testFile -Mode "Write"
                $resolved | Should -Not -BeNullOrEmpty
                Reset-ShadowContext -PurgeFiles
            } finally {
                if ([System.IO.Directory]::Exists($bracketDir)) {
                    [System.IO.Directory]::Delete($bracketDir, $true)
                }
            }
        }

        It "Handles paths containing accented and Unicode characters üñîçødé cleanly" {
            $tempBase = [System.IO.Path]::GetTempPath()
            $unicodeDir = Join-Path $tempBase "komoyasb-chaos-üñîçødé"
            [System.IO.Directory]::CreateDirectory($unicodeDir) | Out-Null
            try {
                $unicodeFile = Join-Path $unicodeDir "theme_日本語.json"
                [System.IO.File]::WriteAllText($unicodeFile, '{"name":"日本語"}', [System.Text.UTF8Encoding]::new($false))

                (Test-Path -LiteralPath $unicodeFile) | Should -BeTrue
                $hash = Get-Sha256Hash -Path $unicodeFile
                $hash | Should -Not -BeNullOrEmpty
            } finally {
                if ([System.IO.Directory]::Exists($unicodeDir)) {
                    [System.IO.Directory]::Delete($unicodeDir, $true)
                }
            }
        }
    }
}
