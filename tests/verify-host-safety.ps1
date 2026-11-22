<#
.SYNOPSIS
    Static analysis check verifying host safety and dry-run guardrails across repository PowerShell scripts.
.DESCRIPTION
    Parses all repository .ps1 and .psm1 scripts using [System.Management.Automation.Language.Parser].
    Verifies that dangerous mutating cmdlets/APIs:
      - [System.IO.File]::Write*
      - Set-ItemProperty
      - New-ItemProperty
      - Stop-Process
      - Start-Process
      - NativeWallpaper::SystemParametersInfo
    are either located inside DryRunContext.psm1 or guarded by DryRun checks / Invoke-SystemAction.
.PARAMETER TargetDir
    Optional root directory of the repository to evaluate. Defaults to parent of tests.
.OUTPUTS
    Exit code 0 on PASS, 1 on FAIL.
.EXAMPLE
    .\verify-host-safety.ps1
.EXAMPLE
    .\verify-host-safety.ps1 -TargetDir "C:\Projects\komoyasb"
.NOTES
    Part of the komoyasb desktop automation suite.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$TargetDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
    if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
    $repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
} else {
    $repoRoot = (Resolve-Path $TargetDir).Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  PowerShell AST Host-Safety Static Analysis Gate              " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Repository Root: $repoRoot" -ForegroundColor Gray

# Collect all repository PowerShell files, excluding node_modules, .git, and tests
$targetFiles = Get-ChildItem -Path $repoRoot -Recurse -Include "*.ps1", "*.psm1" | Where-Object {
    $fullName = $_.FullName
    $fullName -notmatch '\\node_modules\\' -and
    $fullName -notmatch '\\\.git\\' -and
    $fullName -notmatch '\\tests\\' -and
    $fullName -notmatch '\\Test-FullDryRun\.ps1$'
}

$violations = [System.Collections.Generic.List[psobject]]::new()

function Test-IsGuardedByDryRun {
    <#
    .SYNOPSIS
        Evaluates whether an AST node is wrapped in a dry-run / WhatIf conditional guard.
    .DESCRIPTION
        Traverses enclosing AST parents (IfStatementAst, FunctionDefinitionAst) and preceding statements
        in enclosing blocks looking for dry-run checks or early-exit returns.
    .PARAMETER Node
        The target AST element representing the mutating invocation.
    .PARAMETER RootAst
        The root ScriptBlockAst of the file being inspected.
    .OUTPUTS
        [bool] True if the statement is guarded by dry-run checks, false if unprotected.
    .EXAMPLE
        Test-IsGuardedByDryRun -Node $cmdAst -RootAst $ast
    #>
    param(
        [System.Management.Automation.Language.Ast]$Node,
        [System.Management.Automation.Language.ScriptBlockAst]$RootAst
    )

    # 1. Check enclosing AST hierarchy (IfStatementAst, FunctionDefinitionAst, etc.)
    $currentNode = $Node.Parent
    while ($null -ne $currentNode) {
        if ($currentNode -is [System.Management.Automation.Language.IfStatementAst]) {
            $ifClauses = $currentNode.Clauses
            foreach ($singleClause in $ifClauses) {
                $conditionText = $singleClause.Item1.Extent.Text
                # If the condition checks DryRun, isDry, effectiveDry, Test-IsDryRun, WhatIf, etc.
                if ($conditionText -match '(?i)(\$DryRun|\$isDry|\$effectiveDry|Test-IsDryRun|\$WhatIfPreference|\$PSBoundParameters\s*\[\s*[\x27\x22]WhatIf[\x27\x22]\s*\])') {
                    return $true
                }
            }
        }

        if ($currentNode -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
            $enclosingFunctionName = $currentNode.Name
            # Functions inherently part of interception/mocking/package management
            if ($enclosingFunctionName -match '(?i)(Invoke-SystemAction|Initialize-ShadowContext|Export-ShadowLedger|Install-WingetPackage)') {
                return $true
            }
        }

        $currentNode = $currentNode.Parent
    }

    # 2. Check preceding statements in StatementBlockAst / NamedBlockAst or parent blocks for early-exit guards:
    # e.g.: if ($DryRun -or $WhatIfPreference -or $isDry ...) { ... return / continue / break }
    $currentBlock = $Node
    while ($null -ne $currentBlock) {
        $statements = $null
        if ($currentBlock -is [System.Management.Automation.Language.StatementBlockAst]) {
            $statements = $currentBlock.Statements
        } elseif ($currentBlock -is [System.Management.Automation.Language.NamedBlockAst]) {
            $statements = $currentBlock.Statements
        } elseif ($currentBlock -is [System.Management.Automation.Language.ScriptBlockAst] -and $currentBlock.EndBlock) {
            $statements = $currentBlock.EndBlock.Statements
        }

        if ($null -ne $statements) {
            $nodeLine = $Node.Extent.StartLineNumber
            foreach ($statementItem in $statements) {
                if ($statementItem.Extent.EndLineNumber -ge $nodeLine) {
                    break
                }

                if ($statementItem -is [System.Management.Automation.Language.IfStatementAst]) {
                    foreach ($singleClause in $statementItem.Clauses) {
                        $conditionText = $singleClause.Item1.Extent.Text
                        if ($conditionText -match '(?i)(\$DryRun|\$isDry|\$effectiveDry|Test-IsDryRun|\$WhatIfPreference|\$PSBoundParameters\s*\[\s*[\x27\x22]WhatIf[\x27\x22]\s*\])') {
                            $bodyText = $singleClause.Item2.Extent.Text
                            if ($bodyText -match '(?i)\b(return|continue|break)\b') {
                                return $true
                            }
                        }
                    }
                }
            }
        }
        $currentBlock = $currentBlock.Parent
    }

    return $false
}

foreach ($file in $targetFiles) {
    $relPath = $file.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    $isDryRunContext = ($relPath -replace '\\', '/') -match 'scripts/lib/DryRunContext\.psm1$'

    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)

    if ($errors -and $errors.Count -gt 0) {
        Write-Warning "Parser syntax errors in $relPath : $($errors[0].Message)"
    }

    # 1. Search for CommandAst: Set-ItemProperty, New-ItemProperty, Stop-Process, Start-Process
    $commandAsts = $ast.FindAll({
        param($node)
        $node -is [System.Management.Automation.Language.CommandAst]
    }, $true)

    foreach ($cmdAst in $commandAsts) {
        $cmdName = $cmdAst.GetCommandName()
        if (-not $cmdName) { continue }

        $dangerousCmdlets = @('Set-ItemProperty', 'New-ItemProperty', 'Stop-Process', 'Start-Process')
        if ($dangerousCmdlets -contains $cmdName) {
            if ($isDryRunContext) {
                continue
            }

            $isGuarded = Test-IsGuardedByDryRun -Node $cmdAst -RootAst $ast
            if (-not $isGuarded) {
                $violations.Add([PSCustomObject]@{
                    File       = $relPath
                    Line       = $cmdAst.Extent.StartLineNumber
                    Column     = $cmdAst.Extent.StartColumnNumber
                    Expression = $cmdAst.Extent.Text
                    Reason     = "Unguarded call to dangerous cmdlet '$cmdName'"
                })
            }
        }
    }

    # 2. Search for MemberExpressionAst / InvokeMemberExpressionAst for [System.IO.File]::Write* or NativeWallpaper::SystemParametersInfo
    $memberAsts = $ast.FindAll({
        param($node)
        ($node -is [System.Management.Automation.Language.InvokeMemberExpressionAst]) -or
        ($node -is [System.Management.Automation.Language.MemberExpressionAst])
    }, $true)

    foreach ($memAst in $memberAsts) {
        $text = $memAst.Extent.Text
        $isViolation = $false
        $reason = ""

        if ($text -match '(?i)\[System\.IO\.File\]\s*::\s*Write') {
            if (-not $isDryRunContext) {
                $isGuarded = Test-IsGuardedByDryRun -Node $memAst -RootAst $ast
                if (-not $isGuarded) {
                    $isViolation = $true
                    $reason = "Direct call to [System.IO.File]::Write* outside DryRunContext"
                }
            }
        }
        elseif ($text -match '(?i)\[NativeWallpaper\]\s*::\s*SystemParametersInfo|NativeWallpaper::SystemParametersInfo') {
            if (-not $isDryRunContext) {
                $isGuarded = Test-IsGuardedByDryRun -Node $memAst -RootAst $ast
                if (-not $isGuarded) {
                    $isViolation = $true
                    $reason = "Direct invocation of NativeWallpaper::SystemParametersInfo"
                }
            }
        }

        if ($isViolation) {
            $violations.Add([PSCustomObject]@{
                File       = $relPath
                Line       = $memAst.Extent.StartLineNumber
                Column     = $memAst.Extent.StartColumnNumber
                Expression = $text
                Reason     = $reason
            })
        }
    }
}

Write-Host "Checked $($targetFiles.Count) PowerShell files across repository." -ForegroundColor Cyan

if ($violations.Count -eq 0) {
    Write-Host "[PASS] Zero host-safety violations detected. All mutating operations are guarded or encapsulated." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] Found $($violations.Count) host-safety violation(s):" -ForegroundColor Red
    foreach ($v in $violations) {
        Write-Host "  - $($v.File):$($v.Line):$($v.Column) -> $($v.Reason)" -ForegroundColor Yellow
        Write-Host "    Code: $($v.Expression)" -ForegroundColor DarkGray
    }
    exit 1
}
