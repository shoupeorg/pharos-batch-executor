---
name: pharos-batch-executor
description: Prepare and review one unsigned Pharos Pacific Multicall3 transaction containing at least three zero-value read checks.
---

# Pharos Batch Executor

Use this skill only for unsigned batching on Pharos Pacific Mainnet chain `1672`.

1. Collect a valid sender and at least three enabled actions from `CHAIN_ID`, `BLOCK_NUMBER`, `NATIVE_BALANCE`, or controlled `REVERT_PROBE`.
2. Explain that inner calls originate from Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`, not the user.
3. Use `STRICT` when every check must succeed. Use `BEST_EFFORT` only for these zero-value checks and require explicit acknowledgement of failures.
4. Normalize and encode with the shared engine or submit to `/api/simulate`. Never invent arbitrary calls, token authority, value forwarding or user-wallet semantics.
5. Treat EVM reverts, RPC errors, transport failures and malformed data separately. Missing evidence is `UNKNOWN`.
6. Show individual diagnostic estimates, combined estimate and signed comparison. Always show `N → 1` submission/signature reduction.
7. Prepare only through the server gate for the exact unexpired simulation. Decode the transaction back to its ordered actions before delivery.
8. Return unsigned JSON only. Never request a key, sign, broadcast, fund, approve a token or claim simulated state was committed.

Reference `README.md`, `ARCHITECTURE.md`, and `evidence/foundation.json` for verified scope and semantics.
