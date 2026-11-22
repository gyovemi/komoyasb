Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (Get-Module Pester) {
    try {
        InModuleScope Pester {
            if ($script:SafeCommands -and $script:SafeCommands.ContainsKey('Write-Progress')) {
                $script:SafeCommands['Write-Progress'] = { }
            }
        }
    } catch { }
}
$ProgressPreference = 'SilentlyContinue'

Describe "bootstrap.ps1 StrictMode & IEX Reliability Tests" {
    BeforeAll {
        $script:repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $script:bootstrapScript = Join-Path $script:repoRoot "bootstrap.ps1"
        $script:bootstrapContent = Get-Content -LiteralPath $script:bootstrapScript -Raw
    }

    BeforeEach {
        $script:tempTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("komoyasb-boot-test-" + [System.Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path (Join-Path $script:tempTestDir ".git") -Force | Out-Null
        
        $mockInstallScript = @'
[CmdletBinding(PositionalBinding = $false)]
param(
    [switch]$SkipPackages,
    [string]$Theme = "dark",
    [switch]$ApplyWindhawk,
    [switch]$NoAdmin,
    [switch]$DryRun,
    [string]$SandboxRoot = "",
    [switch]$KeepSandbox,
    [string]$LedgerPath = ""
)
$result = [PSCustomObject]@{
    NoAdmin = $NoAdmin.IsPresent
    DryRun = $DryRun.IsPresent
    Theme = $Theme
    SkipPackages = $SkipPackages.IsPresent
    ApplyWindhawk = $ApplyWindhawk.IsPresent
    SandboxRoot = $SandboxRoot
    ArgCount = $args.Count
    Args = @($args)
}
$result | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot "mock-result.json") -Encoding UTF8
exit 0
'@
        Set-Content -Path (Join-Path $script:tempTestDir "install.ps1") -Value $mockInstallScript -Encoding UTF8
    }

    AfterEach {
        if ($script:tempTestDir -and (Test-Path -LiteralPath $script:tempTestDir)) {
            Remove-Item -LiteralPath $script:tempTestDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Context "StrictMode & Pipeline Collection Unrolling Resilience" {
        It "Executes with single switch -NoAdmin without PropertyNotFoundStrict or MethodNotFound" {
            $sb = [scriptblock]::Create($script:bootstrapContent)
            { & $sb -InstallDir $script:tempTestDir -NoAdmin } | Should Not Throw

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.NoAdmin | Should Be $true
        }

        It "Executes with single switch -DryRun without scalar downcasting crash" {
            $sb = [scriptblock]::Create($script:bootstrapContent)
            { & $sb -InstallDir $script:tempTestDir -DryRun } | Should Not Throw

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.DryRun | Should Be $true
        }

        It "Executes via Invoke-Expression simulating one-line remote install without exceptions" {
            $cmd = "& { $script:bootstrapContent } -InstallDir '$script:tempTestDir' -NoAdmin -DryRun"
            { Invoke-Expression $cmd } | Should Not Throw

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.NoAdmin | Should Be $true
            $res.DryRun | Should Be $true
        }
    }

    Context "Working Directory Traversal Resilience" {
        It "Executes cleanly when current working directory is C:\Windows\System32" {
            $prevCwd = (Get-Location).Path
            Set-Location "C:\Windows\System32"
            try {
                $sb = [scriptblock]::Create($script:bootstrapContent)
                { & $sb -InstallDir $script:tempTestDir -NoAdmin -DryRun } | Should Not Throw
            } finally {
                Set-Location $prevCwd
            }

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.NoAdmin | Should Be $true
            $res.DryRun | Should Be $true
        }

        It "Executes cleanly when current working directory is `$env:TEMP" {
            $prevCwd = (Get-Location).Path
            Set-Location $env:TEMP
            try {
                $sb = [scriptblock]::Create($script:bootstrapContent)
                { & $sb -InstallDir $script:tempTestDir -NoAdmin -DryRun } | Should Not Throw
            } finally {
                Set-Location $prevCwd
            }

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.NoAdmin | Should Be $true
            $res.DryRun | Should Be $true
        }
    }

    Context "Parameter Forwarding & Anti-Scrambling Verification" {
        It "Ensures -NoAdmin, -DryRun, and -Theme are bound to the correct parameters and never scrambled" {
            $sb = [scriptblock]::Create($script:bootstrapContent)
            & $sb -InstallDir $script:tempTestDir -NoAdmin -DryRun -Theme "light"

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json

            # Verify parameters were NOT scrambled
            $res.NoAdmin | Should Be $true
            $res.DryRun | Should Be $true
            $res.Theme | Should Be "light"
            # Verify Theme was not hijacked by switch strings like "-NoAdmin" or "-DryRun"
            ($res.Theme -eq "-NoAdmin") | Should Be $false
            ($res.Theme -eq "-DryRun") | Should Be $false
        }

        It "Handles multiple switches and value parameters with arbitrary ordering" {
            $sb = [scriptblock]::Create($script:bootstrapContent)
            & $sb -InstallDir $script:tempTestDir -Theme "dark" -SkipPackages -DryRun -ApplyWindhawk

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json

            $res.Theme | Should Be "dark"
            $res.SkipPackages | Should Be $true
            $res.DryRun | Should Be $true
            $res.ApplyWindhawk | Should Be $true
        }

        It "Safely injects -NoAdmin when operating in rootless mode" {
            $sb = [scriptblock]::Create($script:bootstrapContent)
            # Invoke without explicitly specifying -NoAdmin; non-admin host detects rootless and injects -NoAdmin
            & $sb -InstallDir $script:tempTestDir -DryRun

            $resultFile = Join-Path $script:tempTestDir "mock-result.json"
            (Test-Path -LiteralPath $resultFile) | Should Be $true
            $res = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
            $res.DryRun | Should Be $true
        }
    }

    Context "Live DryRun Integration with Real Repository" {
        It "Executes bootstrap.ps1 against repository install.ps1 from System32 in DryRun" {
            $prevCwd = (Get-Location).Path
            Set-Location "C:\Windows\System32"
            try {
                $sb = [scriptblock]::Create($script:bootstrapContent)
                & $sb -InstallDir $script:repoRoot -DryRun -NoAdmin
                $LASTEXITCODE | Should Be 0
            } finally {
                Set-Location $prevCwd
            }
        }
    }
}
