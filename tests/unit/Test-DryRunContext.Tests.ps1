<#
.SYNOPSIS
    Pester unit test suite for DryRunContext, Environment, and TemplateEngine modules.
.DESCRIPTION
    Validates shadow environment isolation, path resolution mapping, transparent passthrough,
    zero host mutation constraints, action logging, and template rendering within the shadow jail.
.NOTES
    Part of the komoyasb desktop automation suite.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

$envModule = Join-Path $repoRoot "scripts\lib\Environment.psm1"
$dryRunModule = Join-Path $repoRoot "scripts\lib\DryRunContext.psm1"
$templateModule = Join-Path $repoRoot "scripts\lib\TemplateEngine.psm1"

Import-Module $dryRunModule -Force
Import-Module $envModule -Force
Import-Module $templateModule -Force

Describe "DryRunContext Module Unit Tests" {
    BeforeEach {
        Reset-ShadowContext -PurgeFiles
    }

    AfterEach {
        Reset-ShadowContext -PurgeFiles
    }

    Context "Initialize-ShadowContext and Reset-ShadowContext" {
        It "Initializes shadow context with default temp folder" {
            $ctx = Initialize-ShadowContext -KeepSandbox
            $ctx | Should Not BeNullOrEmpty
            $ctx.Active | Should Be $true
            $ctx.SessionId | Should Not BeNullOrEmpty
            (Test-Path -LiteralPath $ctx.ShadowRoot) | Should Be $true
            (Test-Path -LiteralPath $ctx.Directories.UserProfile) | Should Be $true
            (Test-Path -LiteralPath $ctx.Directories.AppData) | Should Be $true
            (Test-Path -LiteralPath $ctx.Directories.LocalAppData) | Should Be $true
            (Test-Path -LiteralPath $ctx.Directories.ProgramData) | Should Be $true
            (Test-Path -LiteralPath $ctx.Directories.Workspace) | Should Be $true

            $shadowRoot = $ctx.ShadowRoot
            Reset-ShadowContext -PurgeFiles
            (Test-Path -LiteralPath $shadowRoot) | Should Be $false
            (Test-IsDryRun) | Should Be $false
        }

        It "Initializes shadow context with custom ShadowRoot" {
            $customRoot = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-custom-test-shadow"
            $ctx = Initialize-ShadowContext -ShadowRoot $customRoot -KeepSandbox
            $ctx.ShadowRoot | Should Be (Resolve-Path $customRoot).Path
            (Test-Path -LiteralPath $customRoot) | Should Be $true
            Reset-ShadowContext -PurgeFiles
            (Test-Path -LiteralPath $customRoot) | Should Be $false
        }
    }

    Context "Resolve-TargetPath Mapping and Sandboxing" {
        It "Maps UserProfile, AppData, LocalAppData and Workspace paths correctly" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-mapping-test"
            $ctx = Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            $envUser = [System.Environment]::GetEnvironmentVariable("USERPROFILE")
            $envApp  = [System.Environment]::GetEnvironmentVariable("APPDATA")
            $envLocal= [System.Environment]::GetEnvironmentVariable("LOCALAPPDATA")

            $liveUserProfile = if ($envUser) { $envUser } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
            $liveAppData = if ($envApp) { $envApp } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData) }
            $liveLocalAppData = if ($envLocal) { $envLocal } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData) }

            $targetUserConfig = Join-Path $liveUserProfile ".config\komorebi\komorebi.json"
            $virtualUserConfig = Resolve-TargetPath -Path $targetUserConfig -Mode "Write"
            $expectedUserConfig = Join-Path $ctx.Directories.UserProfile ".config\komorebi\komorebi.json"
            $virtualUserConfig | Should Be $expectedUserConfig

            $targetAppData = Join-Path $liveAppData "FlowLauncher\Settings\Settings.json"
            $virtualAppData = Resolve-TargetPath -Path $targetAppData -Mode "Write"
            $expectedAppData = Join-Path $ctx.Directories.AppData "FlowLauncher\Settings\Settings.json"
            $virtualAppData | Should Be $expectedAppData

            $targetWorkspace = Join-Path $repoRoot "configs\yasb\config.yaml"
            $virtualWorkspace = Resolve-TargetPath -Path $targetWorkspace -Mode "Write"
            $expectedWorkspace = Join-Path $ctx.Directories.Workspace "configs\yasb\config.yaml"
            $virtualWorkspace | Should Be $expectedWorkspace
        }

        It "Passes through reads to live files when virtual file does not exist" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-read-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -PassthroughRead -KeepSandbox

            $repoArchitectureDoc = Join-Path $repoRoot "docs\DRYRUN_ARCHITECTURE.md"
            $resolvedRead = Resolve-TargetPath -Path $repoArchitectureDoc -Mode "Read"
            # Since virtual file does not exist, passthrough returns the live file path
            $resolvedRead | Should Be (Resolve-Path $repoArchitectureDoc).Path
        }

        It "Returns virtual file on read when virtual file exists" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-read-virtual-test"
            $ctx = Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -PassthroughRead -KeepSandbox

            $virtualWorkspaceDoc = Join-Path $ctx.Directories.Workspace "docs\DRYRUN_ARCHITECTURE.md"
            [System.IO.Directory]::CreateDirectory((Split-Path -Parent $virtualWorkspaceDoc)) | Out-Null
            [System.IO.File]::WriteAllText($virtualWorkspaceDoc, "VIRTUAL_CONTENT", [System.Text.Encoding]::UTF8)

            $repoArchitectureDoc = Join-Path $repoRoot "docs\DRYRUN_ARCHITECTURE.md"
            $resolvedRead = Resolve-TargetPath -Path $repoArchitectureDoc -Mode "Read"
            $resolvedRead | Should Be $virtualWorkspaceDoc
            (Get-Content -LiteralPath $resolvedRead -Raw) | Should Be "VIRTUAL_CONTENT"
        }
    }

    Context "Invoke-SystemAction and Export-ShadowLedger" {
        It "Intercepts actions and exports valid ledger matching specification" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-ledger-test"
            $ctx = Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            # Simulate FileWrite
            $virtualFile = Join-Path $ctx.Directories.UserProfile "test-file.txt"
            [System.IO.File]::WriteAllText($virtualFile, "Hello Shadow World", [System.Text.Encoding]::UTF8)
            Invoke-SystemAction -ActionType "FileWrite" -Target "C:\Users\Fake\test-file.txt" -Metadata @{
                virtualPath = $virtualFile
                livePath = "C:\Users\Fake\test-file.txt"
            }

            # Simulate PackageInstall
            Invoke-SystemAction -ActionType "PackageInstall" -Target "LGUG2Z.komorebi" -Metadata @{
                Command = "winget install LGUG2Z.komorebi"
            }

            # Simulate ProcessControl
            Invoke-SystemAction -ActionType "ProcessControl" -Target "komorebi" -Metadata @{
                Operation = "Stop"
            }

            # Simulate RegistryWrite
            Invoke-SystemAction -ActionType "RegistryWrite" -Target "HKCU:\Control Panel\Desktop\WallpaperStyle" -Metadata @{
                NewValue = "10"
            }

            $ledgerJsonPath = Join-Path $tempShadow "ledger.json"
            $ledger = Export-ShadowLedger -OutputPath $ledgerJsonPath

            (Test-Path -LiteralPath $ledgerJsonPath) | Should Be $true
            $content = Get-Content -LiteralPath $ledgerJsonPath -Raw | ConvertFrom-Json

            $content.sessionId | Should Not BeNullOrEmpty
            $content.isDryRun | Should Be $true
            $content.shadowRoot | Should Be $tempShadow
            $content.summary.totalActions | Should Be 4
            $content.summary.filesWritten | Should Be 1
            $content.summary.packagesSimulated | Should Be 1
            $content.summary.processesControlled | Should Be 1
            $content.summary.registryWrites | Should Be 1

            @($content.actions).Count | Should Be 4
            @($content.fileDiffs).Count | Should Be 1
            $diff = @($content.fileDiffs)[0]
            $diff.changeType | Should Be "Created"
            $diff.shadowSha256 | Should Not BeNullOrEmpty
        }
    }

    Context "Environment.psm1 and TemplateEngine.psm1 integration" {
        It "Resolves directories safely into shadow environment" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-env-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            $komorebiDir = Get-UserConfigDir -SubPath "komorebi"
            $komorebiDir.StartsWith($tempShadow) | Should Be $true
            $komorebiDir.Contains("userprofile") | Should Be $true

            $flowDir = Get-AppDataDir -SubPath "FlowLauncher"
            $flowDir.StartsWith($tempShadow) | Should Be $true
            $flowDir.Contains("appdata") | Should Be $true

            $localDir = Get-LocalAppDataDir -SubPath "komorebi"
            $localDir.StartsWith($tempShadow) | Should Be $true
            $localDir.Contains("localappdata") | Should Be $true
        }

        It "Simulates winget package install via DryRunContext" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-winget-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            $res = Install-WingetPackage -PackageId "LGUG2Z.komorebi"
            $res | Should Be $true

            $ledger = Export-ShadowLedger
            $ledger.summary.packagesSimulated | Should Be 1
        }

        It "Enforces --scope user in simulated winget package install" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-scope-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            $res = Install-WingetPackage -PackageId "LGUG2Z.komorebi" -DryRun
            $res | Should Be $true

            $ledger = Export-ShadowLedger
            $pkgAction = $ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" -and $_.target -eq "LGUG2Z.komorebi" } | Select-Object -Last 1
            $pkgAction | Should Not BeNullOrEmpty
            $pkgAction.metadata.Scope | Should Be "user"
            ($pkgAction.metadata.Command -match '--scope user') | Should Be $true
        }

        It "Gracefully skips RamenSoftware.Windhawk in rootless mode" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-skip-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            $res = Install-WingetPackage -PackageId "RamenSoftware.Windhawk" -NoAdmin -DryRun
            $res | Should Be $true

            $ledger = Export-ShadowLedger
            $skipAction = $ledger.actions | Where-Object { $_.actionType -eq "PackageInstall" -and $_.target -eq "RamenSoftware.Windhawk" } | Select-Object -Last 1
            $skipAction | Should Not BeNullOrEmpty
            $skipAction.metadata.Skipped | Should Be $true
            $skipAction.metadata.Reason | Should Be "RootlessMode"
        }

        It "Evaluates Test-IsAdministrator without throwing" {
            $isAdmin = Test-IsAdministrator
            ($isAdmin -eq $true -or $isAdmin -eq $false) | Should Be $true
        }

        It "Renders templates into shadow destination without touching live path" {
            $tempShadow = Join-Path ([System.IO.Path]::GetTempPath()) "komoyasb-tpl-test"
            Initialize-ShadowContext -ShadowRoot $tempShadow -WorkspaceRoot $repoRoot -KeepSandbox

            # Create a dummy template
            $tplDir = Join-Path $tempShadow "templates"
            [System.IO.Directory]::CreateDirectory($tplDir) | Out-Null
            $dummyTpl = Join-Path $tplDir "test.json.template"
            [System.IO.File]::WriteAllText($dummyTpl, '{"name":"{{app.name}}","path":"{{app.path}}"}', [System.Text.Encoding]::UTF8)

            $envUser = [System.Environment]::GetEnvironmentVariable("USERPROFILE")
            $liveUserProfile = if ($envUser) { $envUser } else { [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) }
            $liveTargetFile = Join-Path $liveUserProfile ".config\komorebi\test.json"

            $tokens = @{
                "app.name" = "KomorebiTest"
                "app.path" = "C:\Test\Path"
            }

            Invoke-TemplateRendering -TemplatePath $dummyTpl -OutputPath $liveTargetFile -Tokens $tokens

            # Live target file MUST NOT exist!
            (Test-Path -LiteralPath $liveTargetFile) | Should Be $false

            # Shadow target file MUST exist!
            $virtualTarget = Resolve-TargetPath -Path $liveTargetFile -Mode "Exists"
            (Test-Path -LiteralPath $virtualTarget) | Should Be $true
            $renderedJson = Get-Content -LiteralPath $virtualTarget -Raw | ConvertFrom-Json
            $renderedJson.name | Should Be "KomorebiTest"
            $renderedJson.path | Should Be "C:\Test\Path"

            $ledger = Export-ShadowLedger
            $ledger.summary.filesWritten | Should Be 1
        }
    }
}
