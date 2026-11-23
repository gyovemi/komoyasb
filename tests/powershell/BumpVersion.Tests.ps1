Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Describe "Bump-Version.ps1 Unit Tests (HIGH-07)" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $bumpScript = Join-Path $repoRoot "scripts\Bump-Version.ps1"
    }

    Context "Git Exit Code Enforcement" {
        It "Script source validates `$LASTEXITCODE -ne 0 and throws on git failures" {
            $content = Get-Content -LiteralPath $bumpScript -Raw
            $content | Should -Match 'git add.*[\r\n]+.*\$LASTEXITCODE -ne 0.*throw'
            $content | Should -Match 'git commit.*[\r\n]+.*\$LASTEXITCODE -ne 0.*throw'
            $content | Should -Match 'git tag.*[\r\n]+.*\$LASTEXITCODE -ne 0.*throw'
        }

        It "Throws when git commit returns non-zero exit code" {
            $testDir = Join-Path ([System.IO.Path]::GetTempPath()) ("komoyasb-bump-test-" + [System.Guid]::NewGuid().ToString("N"))
            New-Item -ItemType Directory -Path (Join-Path $testDir ".git") -Force | Out-Null
            New-Item -ItemType Directory -Path (Join-Path $testDir "ui\src-tauri") -Force | Out-Null
            
            # Create minimal manifest files
            Set-Content -Path (Join-Path $testDir "ui\package.json") -Value '{"version":"1.0.0"}' -Encoding UTF8
            Set-Content -Path (Join-Path $testDir "ui\src-tauri\Cargo.toml") -Value 'version = "1.0.0"' -Encoding UTF8
            Set-Content -Path (Join-Path $testDir "ui\src-tauri\tauri.conf.json") -Value '{"version":"1.0.0"}' -Encoding UTF8
            
            try {
                # Mock git function to simulate commit failure
                function global:git {
                    param([Parameter(ValueFromRemainingArguments)]$args)
                    if ($args -contains "commit") {
                        $global:LASTEXITCODE = 1
                        return "fatal: commit failed"
                    }
                    $global:LASTEXITCODE = 0
                }

                $sb = [scriptblock]::Create((Get-Content -LiteralPath $bumpScript -Raw))
                { & $sb -Version "1.0.1" -Commit } | Should -Throw
            } finally {
                Remove-Item -Path function:\global:git -ErrorAction SilentlyContinue
                if (Test-Path -LiteralPath $testDir) {
                    Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}
