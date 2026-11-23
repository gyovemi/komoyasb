Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Describe "YASB Widgets Unit Tests (MED-06)" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $gpuScript = Join-Path $repoRoot "configs\yasb\widgets\Get-GpuMetrics.ps1"
        $komoScript = Join-Path $repoRoot "configs\yasb\widgets\Get-KomorebiStatus.ps1"
    }

    Context "Get-GpuMetrics.ps1 StrictMode & Fallback" {
        It "Declares Set-StrictMode -Version Latest" {
            $content = Get-Content -LiteralPath $gpuScript -Raw
            $content | Should -Match 'Set-StrictMode -Version Latest'
        }

        It "Outputs valid JSON under StrictMode Latest" {
            $sb = [scriptblock]::Create((Get-Content -LiteralPath $gpuScript -Raw))
            $output = & $sb -Format "json"
            $output | Should -Not -BeNullOrEmpty
            $parsed = $output | ConvertFrom-Json
            $parsed.load | Should -BeOfType [int]
            $parsed.temp | Should -BeOfType [int]
            $parsed.name | Should -Not -BeNullOrEmpty
        }

        It "Outputs valid string format under StrictMode Latest" {
            $sb = [scriptblock]::Create((Get-Content -LiteralPath $gpuScript -Raw))
            $output = & $sb -Format "string"
            $output | Should -Not -BeNullOrEmpty
            $output | Should -Match '%\s*\('
        }
    }

    Context "Get-KomorebiStatus.ps1 StrictMode & Fallback" {
        It "Declares Set-StrictMode -Version Latest" {
            $content = Get-Content -LiteralPath $komoScript -Raw
            $content | Should -Match 'Set-StrictMode -Version Latest'
        }

        It "Outputs valid JSON when komorebic is offline or state is empty" {
            $sb = [scriptblock]::Create((Get-Content -LiteralPath $komoScript -Raw))
            $output = & $sb
            $output | Should -Not -BeNullOrEmpty
            $parsed = $output | ConvertFrom-Json
            $parsed.status | Should -Not -BeNullOrEmpty
            $parsed.layout | Should -Not -BeNullOrEmpty
            $parsed.focused_index | Should -BeOfType [int]
            $parsed.window_count | Should -BeOfType [int]
            $parsed.icon | Should -Not -BeNullOrEmpty
        }
    }
}
