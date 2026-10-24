---
name: pharos-batch-executor
description: Simulate and prepare one strict unsigned Pharos Pacific Multicall3 transaction containing at least three exact native transfers; zero-value read checks remain available.
---

# Pharos Batch Executor

Use only on Pharos Pacific Mainnet chain `1672` with verified Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`.

1. For `NATIVE_TRANSFERS`, collect a sender and three to twelve enabled actions with nonzero recipient and positive exact decimal `amountWei` strings.
2. Use `STRICT` only. Encode `aggregate3Value` with empty inner calldata, `allowFailure=false`, and exact outer value equal to the inner sum.
3. Verify chain ID, Multicall3 bytecode, sender balance and empty recipient bytecode before simulation. Explain that the public sender is not proof of ownership.
4. Simulate every equivalent individual transfer and the exact combined transaction. Keep `eth_call` and `estimate_gas` results distinct and disclose that estimates are unpinned.
5. Treat reverts, RPC errors, transport failures and malformed data separately. Without a trace, use `UNKNOWN` for per-action order in a reverted strict batch; only conclude that no transaction effects were committed.
6. Show exact gas integers, signed difference/percentage and the independent `N transfers → 1 batch transaction` reduction. Never describe estimates as paid gas.
7. Prepare only through the server gate for the exact unexpired report. Round-trip and compare full `from`, `to`, `chainId`, `value`, `data`, action order, recipients, values, flags and calldata.
8. For `READ_CHECKS`, allow only the documented zero-value action vocabulary and genuine STRICT/BEST_EFFORT behavior. Never describe getters as transfers or claims.
9. Return unsigned JSON only. Never request a key, sign, broadcast, fund, approve tokens or claim simulated state was committed.

Reference `README.md`, `ARCHITECTURE.md`, and `evidence/manifest-v1.json` for scope and evidence.
