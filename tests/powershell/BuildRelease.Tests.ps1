Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Describe "build-release.ps1 Checksum Encoding Tests (MED-03)" {
    BeforeAll {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        $buildScript = Join-Path $repoRoot "build-release.ps1"
    }

    Context "BOM-less UTF-8 Checksum Writing" {
        It "Uses UTF8Encoding($false) for SHA256SUMS.txt and hash files instead of Set-Content -Encoding utf8" {
            $content = Get-Content -LiteralPath $buildScript -Raw
            $content | Should -Match '\[System\.IO\.File\]::WriteAllLines\(\$shaSumsPath,.*\[System\.Text\.UTF8Encoding\]::new\(\$false\)\)'
            $content | Should -Not -Match 'SHA256SUMS\.txt"\s*\|\s*Set-Content.*utf8'
        }

        It "Produces BOM-less UTF-8 byte stream when writing checksums" {
            $testDir = Join-Path ([System.IO.Path]::GetTempPath()) ("komoyasb-bom-test-" + [System.Guid]::NewGuid().ToString("N"))
            New-Item -ItemType Directory -Path $testDir -Force | Out-Null
            $testChecksumFile = Join-Path $testDir "SHA256SUMS.txt"
            
            try {
                $lines = @("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  test.exe")
                [System.IO.File]::WriteAllLines($testChecksumFile, [string[]]$lines, [System.Text.UTF8Encoding]::new($false))

                $bytes = [System.IO.File]::ReadAllBytes($testChecksumFile)
                # Verify first 3 bytes are NOT the UTF-8 BOM (0xEF, 0xBB, 0xBF)
                $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
                $hasBom | Should -BeFalse
            } finally {
                if (Test-Path -LiteralPath $testDir) {
                    Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}
