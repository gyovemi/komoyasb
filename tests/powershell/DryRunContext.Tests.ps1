Describe "DryRunContext Module Unit Tests" {
    BeforeAll {
        $script:repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $script:dryRunModule = Join-Path $script:repoRoot "scripts\lib\DryRunContext.psm1"
        Import-Module $script:dryRunModule -Force -Global
    }

    BeforeEach {
        Reset-ShadowContext -PurgeFiles
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
    }

    Context "Get-Sha256Hash" {
        It "Returns lowercase SHA-256 hex string for a valid file" {
            $testFile = Join-Path $TestDrive "test-sha.txt"
            [System.IO.File]::WriteAllText($testFile, "Antigravity SHA256 Test Content", [System.Text.Encoding]::UTF8)

            $hash = Get-Sha256Hash -Path $testFile
            $hash | Should -Not -BeNullOrEmpty
            $hash.Length | Should -Be 64
            $hash | Should -Match '^[0-9a-f]{64}$'

            # Verification of exact hash value
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $bytes = [System.IO.File]::ReadAllBytes($testFile)
            $expectedHash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
            $hash | Should -Be $expectedHash
        }

        It "Returns null when the file does not exist" {
            $nonExistentPath = Join-Path $TestDrive "non-existent-file.txt"
            $hash = Get-Sha256Hash -Path $nonExistentPath
            $hash | Should -BeNullOrEmpty
        }

        It "Returns null when file read fails with an exception" {
            $lockedFile = Join-Path $TestDrive "locked-file.txt"
            [System.IO.File]::WriteAllText($lockedFile, "locked content", [System.Text.Encoding]::UTF8)
            $stream = [System.IO.File]::Open($lockedFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            try {
                $hash = Get-Sha256Hash -Path $lockedFile
                $hash | Should -BeNullOrEmpty
            } finally {
                $stream.Dispose()
            }
        }
    }

    Context "Get-ShadowContext and Test-IsDryRun" {
        It "Returns null and false when context is not initialized" {
            Reset-ShadowContext -PurgeFiles
            $ctx = Get-ShadowContext
            $ctx | Should -BeNullOrEmpty

            $isDry = Test-IsDryRun
            $isDry | Should -BeFalse
        }

        It "Returns true when context is initialized and active" {
            $customRoot = Join-Path $TestDrive "shadow-ctx-test"
            Initialize-ShadowContext -ShadowRoot $customRoot -KeepSandbox | Out-Null

            $ctx = Get-ShadowContext
            $ctx | Should -Not -BeNullOrEmpty
            $ctx.Active | Should -BeTrue

            $isDry = Test-IsDryRun
            $isDry | Should -BeTrue
        }

        It "Returns false when global context has Active = false" {
            $customRoot = Join-Path $TestDrive "shadow-ctx-inactive"
            $ctx = Initialize-ShadowContext -ShadowRoot $customRoot -KeepSandbox
            $ctx.Active = $false
            Set-Variable -Name "KomoyasbShadowContext" -Value $ctx -Scope Global

            $isDry = Test-IsDryRun
            $isDry | Should -BeFalse
        }
    }

    Context "Initialize-ShadowContext" {
        It "Initializes default shadow context in temp directory" {
            $ctx = Initialize-ShadowContext -KeepSandbox
            $ctx | Should -Not -BeNullOrEmpty
            $ctx.Active | Should -BeTrue
            $ctx.SessionId | Should -Match '^[0-9a-fA-F\-]{36}$'
            $ctx.Timestamp | Should -Not -BeNullOrEmpty
            (Test-Path -LiteralPath $ctx.ShadowRoot) | Should -BeTrue

            foreach ($key in @("UserProfile", "AppData", "LocalAppData", "ProgramData", "Workspace", "Fs")) {
                $ctx.Directories.ContainsKey($key) | Should -BeTrue
                (Test-Path -LiteralPath $ctx.Directories[$key]) | Should -BeTrue
            }

            $ctx.Actions.Count | Should -Be 0
            $ctx.FileDiffs.Count | Should -Be 0
        }

        It "Uses UI_SANDBOX_DIR when set and ShadowRoot is omitted" {
            $uiSandboxPath = Join-Path $TestDrive "ui_sandbox"
            [System.IO.Directory]::CreateDirectory($uiSandboxPath) | Out-Null
            $prevEnv = [System.Environment]::GetEnvironmentVariable("UI_SANDBOX_DIR")
            try {
                [System.Environment]::SetEnvironmentVariable("UI_SANDBOX_DIR", $uiSandboxPath)
                $ctx = Initialize-ShadowContext -KeepSandbox
                $ctx.ShadowRoot.StartsWith($uiSandboxPath, [System.StringComparison]::OrdinalIgnoreCase) | Should -BeTrue
            } finally {
                [System.Environment]::SetEnvironmentVariable("UI_SANDBOX_DIR", $prevEnv)
            }
        }

        It "Initializes shadow context with custom ShadowRoot and WorkspaceRoot" {
            $customRoot = Join-Path $TestDrive "custom-shadow"
            $customWorkspace = Join-Path $TestDrive "custom-ws"
            [System.IO.Directory]::CreateDirectory($customWorkspace) | Out-Null

            $ctx = Initialize-ShadowContext -ShadowRoot $customRoot -WorkspaceRoot $customWorkspace -KeepSandbox
            $ctx.ShadowRoot | Should -Be (Resolve-Path $customRoot).Path
            $ctx.WorkspaceRoot | Should -Be (Resolve-Path $customWorkspace).Path
            $ctx.KeepSandbox | Should -BeTrue
        }
    }

    Context "Resolve-TargetPath" {
        BeforeEach {
            $script:shadowRoot = Join-Path $TestDrive "resolve-test"
            $script:ctx = Initialize-ShadowContext -ShadowRoot $script:shadowRoot -WorkspaceRoot $script:repoRoot -KeepSandbox -PassthroughRead -EnforceZeroMutation
        }

        It "Returns unmodified path when DryRun is not active" {
            Reset-ShadowContext -PurgeFiles
            $somePath = "C:\Some\Arbitrary\Path.txt"
            $resolved = Resolve-TargetPath -Path $somePath -Mode "Write"
            $resolved | Should -Be $somePath
        }

        It "Returns path as-is if it is already inside ShadowRoot" {
            $insidePath = Join-Path $script:shadowRoot "userprofile\.config\test.txt"
            $resolved = Resolve-TargetPath -Path $insidePath -Mode "Write"
            $resolved | Should -Be ([System.IO.Path]::GetFullPath($insidePath))
        }

        It "Maps UserProfile paths into shadow userprofile directory" {
            $envUser = [System.Environment]::GetEnvironmentVariable("USERPROFILE")
            $userBase = if ($envUser) { $envUser } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
            $target = Join-Path $userBase ".config\komorebi\komorebi.json"

            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path $script:ctx.Directories.UserProfile ".config\komorebi\komorebi.json"
            $resolved | Should -Be $expected
        }

        It "Maps AppData paths into shadow appdata directory" {
            $envApp = [System.Environment]::GetEnvironmentVariable("APPDATA")
            $appBase = if ($envApp) { $envApp } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
            $target = Join-Path $appBase "FlowLauncher\Settings\Settings.json"

            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path $script:ctx.Directories.AppData "FlowLauncher\Settings\Settings.json"
            $resolved | Should -Be $expected
        }

        It "Maps LocalAppData paths into shadow localappdata directory" {
            $envLocal = [System.Environment]::GetEnvironmentVariable("LOCALAPPDATA")
            $localBase = if ($envLocal) { $envLocal } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }
            $target = Join-Path $localBase "Programs\komorebi\komorebi.exe"

            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path $script:ctx.Directories.LocalAppData "Programs\komorebi\komorebi.exe"
            $resolved | Should -Be $expected
        }

        It "Maps ProgramData paths into shadow programdata directory" {
            $envProg = [System.Environment]::GetEnvironmentVariable("ProgramData")
            $progBase = if ($envProg) { $envProg } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::CommonApplicationData) }
            $target = Join-Path $progBase "Windhawk\Engine\windhawk-cli.exe"

            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path $script:ctx.Directories.ProgramData "Windhawk\Engine\windhawk-cli.exe"
            $resolved | Should -Be $expected
        }

        It "Maps Workspace paths into shadow workspace directory" {
            $target = Join-Path $script:repoRoot "themes\dark.json"
            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path $script:ctx.Directories.Workspace "themes\dark.json"
            $resolved | Should -Be $expected
        }

        It "Maps non-prefixed drive paths into shadow fs drive directory" {
            $target = "X:\CustomDrive\folder\file.txt"
            $resolved = Resolve-TargetPath -Path $target -Mode "Write"
            $expected = Join-Path (Join-Path $script:ctx.Directories.Fs "X") "CustomDrive\folder\file.txt"
            $resolved | Should -Be $expected
        }

        It "Supports passthrough read to live file when virtual file does not exist" {
            $liveFile = Join-Path $TestDrive "live-passthrough.txt"
            [System.IO.File]::WriteAllText($liveFile, "Live content", [System.Text.Encoding]::UTF8)

            $resolved = Resolve-TargetPath -Path $liveFile -Mode "Read"
            $resolved | Should -Be ([System.IO.Path]::GetFullPath($liveFile))
        }

        It "Returns virtual file on read when virtual file exists in shadow" {
            $target = Join-Path $script:repoRoot "themes\dark.json"
            $virtualTarget = Join-Path $script:ctx.Directories.Workspace "themes\dark.json"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $virtualTarget)) | Out-Null
            [System.IO.File]::WriteAllText($virtualTarget, "Shadow theme content", [System.Text.Encoding]::UTF8)

            $resolved = Resolve-TargetPath -Path $target -Mode "Read"
            $resolved | Should -Be $virtualTarget
        }

        It "Throws SecurityException on jail violation in Write mode" {
            # Create a corrupted context where Directories points outside ShadowRoot
            $script:ctx.Directories.UserProfile = "C:\EscapedPath"
            { Resolve-TargetPath -Path "C:\Users\gyove\test.txt" -Mode "Write" } | Should -Throw
        }
    }

    Context "Invoke-SystemAction" {
        It "Executes LiveAction when DryRun is false" {
            Reset-ShadowContext -PurgeFiles
            $script:executed = $false
            $result = Invoke-SystemAction -ActionType "FileWrite" -Target "live.txt" -LiveAction {
                $script:executed = $true
                return "live-result"
            }
            $result | Should -Be "live-result"
            $script:executed | Should -BeTrue
        }

        It "Rethrows exception when LiveAction fails in live mode" {
            Reset-ShadowContext -PurgeFiles
            Remove-Variable -Name "KomoyasbShadowContext" -Scope Global -Force -ErrorAction SilentlyContinue
            {
                Invoke-SystemAction -ActionType "FileWrite" -Target "fail.txt" -LiveAction {
                    throw "Boom"
                }
            } | Should -Throw
        }

        It "Returns true when LiveAction is null and DryRun is false" {
            Reset-ShadowContext -PurgeFiles
            $result = Invoke-SystemAction -ActionType "PackageInstall" -Target "LGUG2Z.komorebi"
            $result | Should -BeTrue
        }

        It "Intercepts actions in DryRun and tracks diffs for FileWrite and FileDelete" {
            $shadowRoot = Join-Path $TestDrive "action-test"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            $liveFile = Join-Path $TestDrive "live-sample.txt"
            [System.IO.File]::WriteAllText($liveFile, "Original Live Content", [System.Text.Encoding]::UTF8)

            $virtualFile = Join-Path $ctx.Directories.Workspace "sample.txt"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $virtualFile)) | Out-Null
            [System.IO.File]::WriteAllText($virtualFile, "Modified Shadow Content", [System.Text.Encoding]::UTF8)

            # Modified changeType
            Invoke-SystemAction -ActionType "FileWrite" -Target $liveFile -Metadata @{
                virtualPath = $virtualFile
                livePath = $liveFile
            }

            $ctx.Actions | Should -HaveCount 1
            $ctx.Actions[0].actionType | Should -Be "FileWrite"
            $ctx.Actions[0].status | Should -Be "Simulated"
            $ctx.FileDiffs.ContainsKey($liveFile) | Should -BeTrue
            $ctx.FileDiffs[$liveFile].changeType | Should -Be "Modified"
            $ctx.FileDiffs[$liveFile].originalSha256 | Should -Not -BeNullOrEmpty
            $ctx.FileDiffs[$liveFile].shadowSha256 | Should -Not -BeNullOrEmpty
            $ctx.FileDiffs[$liveFile].originalSha256 | Should -Not -Be $ctx.FileDiffs[$liveFile].shadowSha256

            # Created changeType
            $newLiveFile = Join-Path $TestDrive "new-file.txt"
            $newVirtualFile = Join-Path $ctx.Directories.Workspace "new-file.txt"
            [System.IO.File]::WriteAllText($newVirtualFile, "New content", [System.Text.Encoding]::UTF8)
            Invoke-SystemAction -ActionType "FileWrite" -Target $newLiveFile -Metadata @{
                virtualPath = $newVirtualFile
                livePath = $newLiveFile
            }
            $ctx.FileDiffs[$newLiveFile].changeType | Should -Be "Created"
            $ctx.FileDiffs[$newLiveFile].originalSha256 | Should -BeNullOrEmpty

            # Unchanged changeType
            $unchangedLive = Join-Path $TestDrive "unchanged.txt"
            [System.IO.File]::WriteAllText($unchangedLive, "Same content", [System.Text.Encoding]::UTF8)
            $unchangedVirtual = Join-Path $ctx.Directories.Workspace "unchanged.txt"
            [System.IO.File]::WriteAllText($unchangedVirtual, "Same content", [System.Text.Encoding]::UTF8)
            Invoke-SystemAction -ActionType "FileWrite" -Target $unchangedLive -Metadata @{
                virtualPath = $unchangedVirtual
                livePath = $unchangedLive
            }
            $ctx.FileDiffs[$unchangedLive].changeType | Should -Be "Unchanged"

            # Target fallback when virtualPath and livePath are omitted from metadata
            Invoke-SystemAction -ActionType "FileWrite" -Target "C:\sample_fallback.txt" -Metadata @{}

            # Deleted changeType
            Invoke-SystemAction -ActionType "FileDelete" -Target $liveFile -Metadata @{
                virtualPath = $virtualFile
                livePath = $liveFile
            }
            $ctx.FileDiffs[$liveFile].changeType | Should -Be "Deleted"
            $ctx.FileDiffs[$liveFile].shadowSha256 | Should -BeNullOrEmpty
            $ctx.FileDiffs[$liveFile].byteSize | Should -Be 0

            # Other action types
            Invoke-SystemAction -ActionType "RegistryWrite" -Target "HKCU:\Test"
            Invoke-SystemAction -ActionType "PackageInstall" -Target "LGUG2Z.komorebi"
            Invoke-SystemAction -ActionType "ProcessControl" -Target "komorebi"
            Invoke-SystemAction -ActionType "WallpaperApply" -Target "wallpaper.png"
            Invoke-SystemAction -ActionType "WindhawkMod" -Target "taskbar-autohide"

            $ctx.Actions.Count | Should -Be 10
        }
    }

    Context "Export-ShadowLedger" {
        It "Serializes ledger to JSON file and validates schema properties" {
            $shadowRoot = Join-Path $TestDrive "export-test"
            $ctx = Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox

            Invoke-SystemAction -ActionType "RegistryWrite" -Target "HKCU:\Test" -Metadata @{ Key = "Val" }
            Invoke-SystemAction -ActionType "PackageInstall" -Target "LGUG2Z.komorebi"
            Invoke-SystemAction -ActionType "ProcessControl" -Target "komorebi"

            $outPath = Join-Path $shadowRoot "subdir\ledger.json"
            $ledger = Export-ShadowLedger -OutputPath $outPath

            (Test-Path -LiteralPath $outPath) | Should -BeTrue
            $ledger | Should -Not -BeNullOrEmpty
            $ledger.isDryRun | Should -BeTrue
            $ledger.shadowRoot | Should -Be (Resolve-Path $shadowRoot).Path
            $ledger.summary.totalActions | Should -Be 3
            $ledger.summary.registryWrites | Should -Be 1
            $ledger.summary.packagesSimulated | Should -Be 1
            $ledger.summary.processesControlled | Should -Be 1

            $parsed = Get-Content -LiteralPath $outPath -Raw | ConvertFrom-Json
            $parsed.'$schema' | Should -Be "http://json-schema.org/draft-07/schema#"
            $parsed.summary.totalActions | Should -Be 3
        }

        It "Exports ledger correctly when activeContext is null" {
            Reset-ShadowContext -PurgeFiles
            $ledger = Export-ShadowLedger
            $ledger.isDryRun | Should -BeFalse
            $ledger.shadowRoot | Should -BeNullOrEmpty
            $ledger.summary.totalActions | Should -Be 0
        }
    }

    Context "Reset-ShadowContext" {
        It "Purges files when PurgeFiles is specified" {
            $shadowRoot = Join-Path $TestDrive "purge-test"
            Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox | Out-Null
            (Test-Path -LiteralPath $shadowRoot) | Should -BeTrue

            Reset-ShadowContext -PurgeFiles
            (Test-Path -LiteralPath $shadowRoot) | Should -BeFalse
            (Test-IsDryRun) | Should -BeFalse
        }

        It "Purges files automatically when KeepSandbox is false" {
            $shadowRoot = Join-Path $TestDrive "no-keep-test"
            Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox:$false | Out-Null
            (Test-Path -LiteralPath $shadowRoot) | Should -BeTrue

            Reset-ShadowContext
            (Test-Path -LiteralPath $shadowRoot) | Should -BeFalse
        }

        It "Retains files when KeepSandbox is true and PurgeFiles is false" {
            $shadowRoot = Join-Path $TestDrive "keep-test"
            Initialize-ShadowContext -ShadowRoot $shadowRoot -KeepSandbox:$true | Out-Null
            (Test-Path -LiteralPath $shadowRoot) | Should -BeTrue

            Reset-ShadowContext
            (Test-Path -LiteralPath $shadowRoot) | Should -BeTrue
            (Test-IsDryRun) | Should -BeFalse

            # Cleanup
            [System.IO.Directory]::Delete($shadowRoot, $true)
        }
    }
}
