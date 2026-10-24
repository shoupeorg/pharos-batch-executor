$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
$SafeProject = $Project.Replace('\', '/')
$Base = 'https://pharos-batch-executor.shoupeorg.workers.dev'

Set-Location -LiteralPath $Project

function Run-Native {
  param([scriptblock]$Command, [string]$Failure)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Failure (exit code $LASTEXITCODE)" }
}

Write-Host '==> Configure Cloudflare D1 only if it is not configured'
$Wrangler = Get-Content -LiteralPath 'wrangler.jsonc' -Raw
if ($Wrangler -match 'REPLACE_AFTER_CREATION') {
  $CreateOutput = (& npx.cmd wrangler d1 create pharos-batch-executor 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "D1 creation failed:`n$CreateOutput" }
  $Match = [regex]::Match($CreateOutput, 'database_id\s*[=:]\s*["''](?<id>[0-9a-fA-F-]{36})["'']')
  if (-not $Match.Success) { throw "D1 was created but its database ID could not be parsed:`n$CreateOutput" }
  $Wrangler = $Wrangler.Replace('REPLACE_AFTER_CREATION', $Match.Groups['id'].Value)
  Set-Content -LiteralPath 'wrangler.jsonc' -Value $Wrangler -NoNewline
}

Write-Host '==> Commit the deployment configuration and resume script'
& git -c "safe.directory=$SafeProject" add wrangler.jsonc scripts/resume-publish-deploy.ps1 STATUS.md
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
& git -c "safe.directory=$SafeProject" diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  Run-Native { git -c "safe.directory=$SafeProject" commit -m 'Configure publication and deployment' } 'git commit failed'
} elseif ($LASTEXITCODE -ne 0) { throw 'git diff failed.' }

Write-Host '==> Publish main using the installed Git Credential Manager'
Run-Native { git -c "safe.directory=$SafeProject" push -u origin main } 'Git push failed'

Write-Host '==> Apply the existing D1 migration'
Run-Native { npx.cmd wrangler d1 migrations apply pharos-batch-executor --remote } 'Remote D1 migration failed'

Write-Host '==> Deploy the already-built Worker and assets once'
$DeployOutput = (& npx.cmd wrangler deploy --no-bundle 2>&1 | Tee-Object -Variable DeployLines | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Deployment failed:`n$DeployOutput" }
Write-Host $DeployOutput

Write-Host '==> Verify public UI, API, evidence, simulation and server-side export gate'
$Ui = Invoke-WebRequest -Uri "$Base/" -TimeoutSec 30
if ($Ui.StatusCode -ne 200 -or $Ui.Content -notmatch 'Pharos Batch Executor') { throw 'Public UI assertion failed.' }
$Logo = Invoke-WebRequest -Uri "$Base/pharos-logo.png" -TimeoutSec 30
if ($Logo.StatusCode -ne 200 -or $Logo.Headers.'Content-Type' -notmatch 'image/png') { throw 'Logo assertion failed.' }
$Meta = Invoke-RestMethod -Uri "$Base/api/meta" -TimeoutSec 30
if ($Meta.engineVersion -ne 'batch-executor/1.0.0' -or $Meta.network.chainId -ne 1672) { throw 'Metadata assertion failed.' }
foreach ($EvidenceName in @('manifest-v1.json','live-valid.json','live-strict-failure.json','live-best-effort.json')) {
  $EvidenceResponse = Invoke-WebRequest -Uri "$Base/evidence/$EvidenceName" -TimeoutSec 30
  if ($EvidenceResponse.StatusCode -ne 200 -or $EvidenceResponse.Headers.'Content-Type' -notmatch 'application/json') {
    throw "Evidence assertion failed for $EvidenceName."
  }
}

$Request = @{
  chainId = 1672
  from = '0x15ddce897d76ac39c188ade4d353711a60395315'
  mode = 'STRICT'
  actions = @(
    @{ type = 'CHAIN_ID'; label = 'Verify Pacific chain ID'; enabled = $true },
    @{ type = 'BLOCK_NUMBER'; label = 'Read current block number'; enabled = $true },
    @{ type = 'NATIVE_BALANCE'; label = 'Read sender native balance'; subject = '0x15ddce897d76ac39c188ade4d353711a60395315'; enabled = $true }
  )
}
$Json = $Request | ConvertTo-Json -Depth 8
$Simulation = Invoke-RestMethod -Uri "$Base/api/simulate" -Method Post -ContentType 'application/json' -Body $Json -TimeoutSec 30
if ($Simulation.report.batchOutcome -ne 'SUCCESS' -or $Simulation.report.actions.Count -ne 3 -or $Simulation.report.submissionReduction.reduction -ne 2) {
  throw 'Public simulation assertion failed.'
}
$PrepareBody = @{ simulationId = $Simulation.report.simulationId; request = $Request } | ConvertTo-Json -Depth 10
$Prepared = Invoke-RestMethod -Uri "$Base/api/prepare" -Method Post -ContentType 'application/json' -Body $PrepareBody -TimeoutSec 30
if (-not $Prepared.authorized -or $Prepared.unsignedTransaction.to -ne '0xcA11bde05977b3631167028862bE2a173976CA11') {
  throw 'Unsigned preparation assertion failed.'
}
try {
  Invoke-RestMethod -Uri "$Base/api/prepare" -Method Post -ContentType 'application/json' -Body $PrepareBody -TimeoutSec 30 | Out-Null
  throw 'Repeated preparation was incorrectly accepted.'
} catch {
  if ($_.Exception.Message -eq 'Repeated preparation was incorrectly accepted.') { throw }
}

Write-Host '==> Verify local and remote commits match and required source is published'
Run-Native { git -c "safe.directory=$SafeProject" fetch origin main } 'git fetch failed'
$Local = (& git -c "safe.directory=$SafeProject" rev-parse HEAD).Trim()
$Remote = (& git -c "safe.directory=$SafeProject" rev-parse origin/main).Trim()
if ($Local -ne $Remote) { throw "Commit mismatch: local=$Local remote=$Remote" }
& git -c "safe.directory=$SafeProject" cat-file -e "$Remote`:src/worker.js"
if ($LASTEXITCODE -ne 0) { throw 'src/worker.js is absent from the remote commit.' }

$Version = [regex]::Match($DeployOutput, 'Current Version ID:\s*(?<id>[0-9a-f-]{36})').Groups['id'].Value
Write-Host ''
Write-Host 'PUBLICATION AND DEPLOYMENT VERIFIED' -ForegroundColor Green
Write-Host "Repository: https://github.com/shoupeorg/pharos-batch-executor"
Write-Host "Demo:       $Base"
Write-Host "Commit:     $Local"
Write-Host "Version:    $Version"
Write-Host 'No blockchain transaction was signed or broadcast.'
