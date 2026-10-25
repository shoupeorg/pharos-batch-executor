# Status

Updated: 2026-10-25

## Foundation and original release preserved

- Public repository: `https://github.com/shoupeorg/pharos-batch-executor`.
- Existing D1: `pharos-batch-executor`, ID `77847f5e-26e1-4687-8ba4-4218c2985478`, binding `DB`.
- Original zero-value `aggregate3` STRICT/BEST_EFFORT implementation and v1.0 evidence remain available without overwriting historical records.
- No key, signer, funding, signing, broadcasting, contract deployment or blockchain spending occurred.

## Consolidated native-transfer pass

- Reverified Pacific chain ID `1672`, Multicall3 runtime bytecode and `aggregate3Value` support at block `21144392` through official Chain MCP.
- Primary Multicall3 source confirms exact per-call value forwarding, final outer-value equality, and strict failure behavior.
- Added primary `NATIVE_TRANSFERS` workflow: three to twelve positive exact decimal wei transfers, nonzero verified empty-code recipients, empty calldata, STRICT `allowFailure=false`, and exact outer value sum.
- Added live sender-balance and recipient-bytecode preflight, exact ABI round-trip, full transaction equality gate, invalid/historical timestamp rejection, and conditional one-export D1 consumption.
- Corrected strict failure attribution: when no trace exists, independently successful diagnostics do not become invented `ROLLED_BACK` actions; current engine uses `UNKNOWN` while preserving the transaction-level no-commit conclusion.
- Updated the public retro UI with separate **Native transfers** and **Read checks** workflows, edit invalidation, duplicate-submit guard, precise value/caller semantics and v1.1 evidence buttons.

## Live v1.1 evidence

- Success: three real Chain MCP simulations of `1 wei` individual transfers and their exact combined `aggregate3Value` call all succeeded at pinned call block `21144392`.
- Gas estimates are unpinned: `21000 + 21000 + 21000 = 63000` individual versus `101286` combined; signed difference `-38286` (`-60.77%`). Batching costs more estimated gas; practical reduction is `3 → 1` submissions/signatures.
- Failure: the same three calls with controlled outer value `4 wei` versus inner sum `3 wei` genuinely reverted with `Multicall3: value mismatch`; estimates reverted too. Per-action execution order is `UNKNOWN`, no transfer was committed, and preparation is unauthorized.
- Records: `evidence/v1.1-live-native-success.json` and `evidence/v1.1-live-native-failure.json`, with matching public copies.

## Verification checkpoint

- Full suite: `34/34` passing.
- Production Rollup build: passing. The dependency-level `this` rewrite warning from `aes-js` remains non-fatal.
- English-only and credential-pattern scans passed; versioned JSON evidence and public copies parse and match.
- Consolidated implementation commit: `785808f95730d15212383781de14487df5d66b05`.
- No related background process is running.
- Remaining: push, one deployment, and public UI/API/download/failure/remote verification.
- Current sandbox blocker: Git Credential Manager cannot persist credentials and the non-interactive process has no `/dev/tty`. Use the stage-specific `scripts/resume-publish-deploy.ps1` once in normal Windows PowerShell; it does not create D1, rerun migrations, recapture evidence, run tests, or perform blockchain operations.

## Post-deployment verification correction

- Deployment `e665cb06-a921-4c8f-815e-22bdaefda3ac` serves engine `batch-executor/1.1.0-native-transfers` with the intended UI and assets.
- The original PowerShell check treated any HTTP 200 simulation report that was not immediately `SUCCESS` as a generic assertion failure. The API intentionally returns structured reports for `SUCCESS`, `REVERT`, and `UNKNOWN`; transient RPC/gas evidence can therefore produce a valid non-success report without an application defect.
- A fresh exact public request returned HTTP `200`, `application/json; charset=utf-8`, three `SUCCESS` actions, verified preflight, gas `63000` versus `101286`, reduction `2`, and the exact 3 wei transaction.
- Public changed-request preparation returned `400`; exact preparation returned `200` and round-tripped three strict 1 wei calls; replay returned `400`. UI, engine metadata, all six evidence files, and downloaded JSON contents passed.
- The verification script now checks the complete documented report contract, reports detailed diagnostics, and retries at most three times only for `UNKNOWN` or unavailable-gas evidence. Deterministic reverts and all other mismatches fail immediately.
- Full suite remains `34/34`; production build passes. No application code/assets changed after deployment, so no redeployment is required for this script-only correction.
