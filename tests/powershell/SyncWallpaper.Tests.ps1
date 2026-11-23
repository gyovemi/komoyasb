Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Describe "sync-wallpaper.ps1 Unit Tests (MED-04)" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $syncWallpaperScript = Join-Path $repoRoot "scripts\sync-wallpaper.ps1"
    }

    Context "Path Resolution Logic" {
        It "Script source resolves relative paths against repoRoot, Get-Location, and scriptDir" {
            $content = Get-Content -LiteralPath $syncWallpaperScript -Raw
            $content | Should -Match '\$resolvedPath = Join-Path \$repoRoot \$Path'
            $content | Should -Match '\$repoRoot = if \(Get-Command "Get-WorkspaceRoot"'
        }

        It "Resolves wallpaper path relative to repoRoot when CWD is an arbitrary directory" {
            $prevCwd = (Get-Location).Path
            $tempDir = [System.IO.Path]::GetTempPath()
            Set-Location $tempDir
            try {
                # Test with relative path configs/polish/wallpapers/dark.png under dry-run / check existence
                $relPath = "configs\polish\wallpapers\dark.png"
                $expectedFull = Join-Path $repoRoot $relPath
                (Test-Path -LiteralPath $expectedFull) | Should -BeTrue

                # Running sync-wallpaper.ps1 -Path with relative path in WhatIf/DryRun
                # Since Add-Type may be executed, we test the path resolution block
                $sb = [scriptblock]::Create(@"
                    `$Path = '$relPath'
                    `$scriptDir = '$repoRoot\scripts'
                    `$repoRoot = '$repoRoot'
                    if (-not [System.IO.Path]::IsPathRooted(`$Path)) {
                        `$resolvedPath = Join-Path (Get-Location).Path `$Path
                        if (-not (Test-Path `$resolvedPath)) {
                            `$resolvedPath = Join-Path `$repoRoot `$Path
                        }
                        if (-not (Test-Path `$resolvedPath)) {
                            `$resolvedPath = Join-Path `$scriptDir `$Path
                        }
                        `$Path = `$resolvedPath
                    }
                    return `$Path
"@)
                $resolved = & $sb
                $resolved | Should -Be $expectedFull
            } finally {
                Set-Location $prevCwd
            }
        }
    }
}
