# Status

Updated: 2026-10-24

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
- Remaining: English/secret scan, commit/push, one deployment, and public UI/API/download/failure/remote verification.
