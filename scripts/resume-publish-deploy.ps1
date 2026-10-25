$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
$SafeProject = $Project.Replace('\', '/')
$Base = 'https://pharos-batch-executor.shoupeorg.workers.dev'
$ExpectedDatabaseName = 'pharos-batch-executor'
$ExpectedDatabaseId = '77847f5e-26e1-4687-8ba4-4218c2985478'

Set-Location -LiteralPath $Project

function Run-Native {
  param([scriptblock]$Command, [string]$Failure)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Failure (exit code $LASTEXITCODE)" }
}

Write-Host '==> Verify and reuse the existing Cloudflare D1 binding'
$Wrangler = Get-Content -LiteralPath 'wrangler.jsonc' -Raw
if ($Wrangler -notmatch [regex]::Escape('"binding": "DB"')) {
  throw 'The source expects a D1 binding named DB, but wrangler.jsonc does not define it.'
}
if ($Wrangler -notmatch [regex]::Escape('"database_name": "' + $ExpectedDatabaseName + '"')) {
  throw "wrangler.jsonc does not target the existing D1 database $ExpectedDatabaseName."
}
if ($Wrangler -notmatch [regex]::Escape('"database_id": "' + $ExpectedDatabaseId + '"')) {
  throw "wrangler.jsonc does not contain the verified existing D1 ID $ExpectedDatabaseId."
}
Write-Host "Reusing D1 $ExpectedDatabaseName ($ExpectedDatabaseId) with binding DB."

Write-Host '==> Commit the deployment configuration and resume script'
& git -c "safe.directory=$SafeProject" add wrangler.jsonc scripts/resume-publish-deploy.ps1 STATUS.md
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
& git -c "safe.directory=$SafeProject" diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  Run-Native { git -c "safe.directory=$SafeProject" commit -m 'Configure publication and deployment' } 'git commit failed'
} elseif ($LASTEXITCODE -ne 0) { throw 'git diff failed.' }

Write-Host '==> Publish main using the installed Git Credential Manager'
Run-Native { git -c "safe.directory=$SafeProject" push -u origin main } 'Git push failed'

Write-Host '==> Deploy the already-built Worker and assets once'
$DeployOutput = (& npx.cmd wrangler deploy --no-bundle 2>&1 | Tee-Object -Variable DeployLines | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Deployment failed:`n$DeployOutput" }
Write-Host $DeployOutput

Write-Host '==> Verify public UI, API, evidence, simulation and server-side export gate'
$Ui = Invoke-WebRequest -Uri "$Base/" -UseBasicParsing -TimeoutSec 30
if ($Ui.StatusCode -ne 200 -or $Ui.Content -notmatch 'Pharos Batch Executor') { throw 'Public UI assertion failed.' }
$Logo = Invoke-WebRequest -Uri "$Base/pharos-logo.png" -UseBasicParsing -TimeoutSec 30
if ($Logo.StatusCode -ne 200 -or $Logo.Headers.'Content-Type' -notmatch 'image/png') { throw 'Logo assertion failed.' }
$Meta = Invoke-RestMethod -Uri "$Base/api/meta" -TimeoutSec 30
if ($Meta.engineVersion -ne 'batch-executor/1.1.0-native-transfers' -or $Meta.network.chainId -ne 1672) { throw 'Metadata assertion failed.' }
foreach ($EvidenceName in @('manifest-v1.json','v1.1-live-native-success.json','v1.1-live-native-failure.json','live-valid.json','live-strict-failure.json','live-best-effort.json')) {
  $EvidenceResponse = Invoke-WebRequest -Uri "$Base/evidence/$EvidenceName" -UseBasicParsing -TimeoutSec 30
  if ($EvidenceResponse.StatusCode -ne 200 -or $EvidenceResponse.Headers.'Content-Type' -notmatch 'application/json') {
    throw "Evidence assertion failed for $EvidenceName."
  }
}

$Request = @{
  workflow = 'NATIVE_TRANSFERS'
  chainId = 1672
  from = '0x15ddce897d76ac39c188ade4d353711a60395315'
  contract = '0xcA11bde05977b3631167028862bE2a173976CA11'
  mode = 'STRICT'
  actions = @(
    @{ type = 'NATIVE_TRANSFER'; label = 'Transfer 1 wei to public EOA example'; recipient = '0x15ddce897d76ac39c188ade4d353711a60395315'; amountWei = '1'; enabled = $true },
    @{ type = 'NATIVE_TRANSFER'; label = 'Transfer 1 wei to empty-code recipient'; recipient = '0x1111111111111111111111111111111111111111'; amountWei = '1'; enabled = $true },
    @{ type = 'NATIVE_TRANSFER'; label = 'Transfer 1 wei to second empty-code recipient'; recipient = '0x2222222222222222222222222222222222222222'; amountWei = '1'; enabled = $true }
  )
}
$Json = $Request | ConvertTo-Json -Depth 8
$RejectedRequest = (($Json | ConvertFrom-Json) | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
$RejectedRequest.actions[1].recipient = '0xcA11bde05977b3631167028862bE2a173976CA11'
$Rejected = $false
try {
  Invoke-RestMethod -Uri "$Base/api/simulate" -Method Post -ContentType 'application/json' -Body ($RejectedRequest | ConvertTo-Json -Depth 8) -TimeoutSec 30 | Out-Null
} catch {
  $Rejected = [int]$_.Exception.Response.StatusCode -eq 400
}
if (-not $Rejected) { throw 'Contract-recipient failure path assertion failed.' }

$Simulation = Invoke-RestMethod -Uri "$Base/api/simulate" -Method Post -ContentType 'application/json' -Body $Json -TimeoutSec 30
if ($Simulation.report.batchOutcome -ne 'SUCCESS' -or $Simulation.report.actions.Count -ne 3 -or $Simulation.report.submissionReduction.reduction -ne 2) {
  throw 'Public simulation assertion failed.'
}
$PrepareBody = @{ simulationId = $Simulation.report.simulationId; request = $Request } | ConvertTo-Json -Depth 10
$ChangedRequest = (($Json | ConvertFrom-Json) | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
$ChangedRequest.actions[0].amountWei = '2'
$ChangedPrepare = @{ simulationId = $Simulation.report.simulationId; request = $ChangedRequest } | ConvertTo-Json -Depth 10
$ChangedRejected = $false
try {
  Invoke-RestMethod -Uri "$Base/api/prepare" -Method Post -ContentType 'application/json' -Body $ChangedPrepare -TimeoutSec 30 | Out-Null
} catch {
  $ChangedRejected = [int]$_.Exception.Response.StatusCode -eq 400
}
if (-not $ChangedRejected) { throw 'Changed-request preparation was incorrectly accepted.' }

$Prepared = Invoke-RestMethod -Uri "$Base/api/prepare" -Method Post -ContentType 'application/json' -Body $PrepareBody -TimeoutSec 30
if (-not $Prepared.authorized -or $Prepared.transaction.to -ne '0xcA11bde05977b3631167028862bE2a173976CA11' -or $Prepared.transaction.value -ne '3' -or $Prepared.transaction.chainId -ne 1672) {
  throw 'Unsigned preparation assertion failed.'
}
if ($Prepared.decodedBatch.Count -ne 3 -or ($Prepared.decodedBatch | Where-Object { $_.allowFailure -ne $false -or $_.valueWei -ne '1' -or $_.callData -ne '0x' }).Count -ne 0) {
  throw 'Decoded native-transfer round-trip assertion failed.'
}
$Downloaded = ($Prepared | ConvertTo-Json -Depth 20) | ConvertFrom-Json
if (-not $Downloaded.authorized -or $Downloaded.transaction.data -ne $Prepared.transaction.data) { throw 'Downloaded JSON content assertion failed.' }
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
