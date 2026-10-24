# Pharos Batch Executor

Batch Rehearsal Desk prepares at least three independent native transfers inside one actual unsigned Multicall3 transaction on Pharos Pacific Mainnet. It verifies sender balance and empty recipient bytecode, simulates the individual transfers and exact combined transaction, decodes every field, compares gas honestly, and enforces a server-side one-export gate. It never accepts keys, signs or broadcasts.

The earlier zero-value read checks remain available as supplementary `READ_CHECKS` functionality with preserved historical evidence.

## Verified foundation

- Network: Pharos Pacific Mainnet, chain ID `1672`, RPC `https://rpc.pharos.xyz`.
- Contract: Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`.
- Chain MCP reverified 3,808 bytes of deployed code at block `21144392`; runtime code hash `0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891`.
- The deployed runtime contains selector `0x174dea71`; a pinned empty `aggregate3Value` call succeeded at block `21144392`.
- The [primary Multicall3 source](https://github.com/mds1/multicall3/blob/main/src/Multicall3.sol) defines `Call3Value(target, allowFailure, value, callData)`, forwards each exact value with `target.call{value: value}`, reverts a disallowed failure, and finally requires `msg.value == sum(call.value)`.
- `eth_call` supports a block argument; the inspected Chain MCP `estimate_gas` schema does not. Estimates are explicitly unpinned.

## Supported workflows

### Native transfers — primary

- Three to twelve enabled `NATIVE_TRANSFER` actions.
- Exact positive decimal-string `amountWei`; integer arithmetic uses `BigInt`.
- Valid nonzero recipients with successfully verified empty deployed bytecode. Contract recipients are rejected because fallback/receive behavior would make the transfer semantics application-specific.
- `STRICT` only; every `allowFailure` is `false` and every inner calldata value is `0x`.
- Exact outer `value = sum(inner values)` and ABI-valid `aggregate3Value` calldata.
- Sender balance is a live preflight check. The public sender is an observation input and does not establish ownership or permission to spend.

The default example sends a simulated `1 wei` to each of three verified empty-code addresses. No funds move during `eth_call` or `estimate_gas`.

### Read checks — supplementary

- `CHAIN_ID`, `BLOCK_NUMBER`, `NATIVE_BALANCE`, and controlled `REVERT_PROBE`.
- Zero-value `aggregate3` with genuine `STRICT` or `BEST_EFFORT` semantics.
- Read checks are calls, not transfers or claims. Their `N → 1` comparison is reduced submissions/calls, not a claim that ordinary reads require signatures.

## Transaction and failure semantics

The exported native-transfer transaction contains `chainId`, `from`, verified `to`, exact decimal `value`, and encoded calldata. Round-trip decoding verifies action order, recipient, amount, `allowFailure=false`, empty inner calldata, and the total value.

If a strict combined call reverts and no trace is available, independently successful diagnostics do not prove combined execution order. Current reports use `UNKNOWN` for those actions and state only the defensible transaction-level conclusion: the reverted call committed no transfers. Original v1.0 read-check evidence remains unchanged and is historical.

EVM reverts remain distinct from RPC errors, transport failures, malformed responses and unavailable estimates. Missing gas is `UNKNOWN`, never zero.

## Honest optimization evidence

The v1.1 live example uses the same sender and three `1 wei` actions:

- Individual estimates: `21000 + 21000 + 21000 = 63000` gas.
- Combined estimate: `101286` gas.
- Signed difference: `63000 − 101286 = -38286` gas (`-60.77%`).
- Practical reduction: `3 independent transfers → 1 batch transaction`, two fewer submissions/signatures.

Batching costs more estimated gas in this example. These are estimates, not receipts, paid gas or guaranteed realized savings.

## Server-side preparation gate

`POST /api/simulate` normalizes the exact request, verifies chain ID, Multicall3 bytecode, sender balance and recipient bytecode, then stores the report and canonical digest in D1 for ten minutes. `POST /api/prepare` recomputes normalization and compares the full transaction (`from`, `to`, `chainId`, `value`, `data`). It rejects changed, wrong-chain/contract, stale, historical, failed, incomplete, missing-gas, unsupported-mode and mismatched-value requests. A conditional D1 update consumes a simulation exactly once, including under concurrent preparation attempts.

Editing the browser form invalidates the displayed simulation and disables preparation/download until a fresh server simulation succeeds. Duplicate simulation clicks are guarded.

## Development

```powershell
npm ci
npm test
npm run build
npm run cli -- request.json
npx wrangler dev
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [SKILL.md](SKILL.md), [STATUS.md](STATUS.md), [SUBMISSION.md](SUBMISSION.md), and [versioned evidence](evidence/manifest-v1.json).

## Reviewer workflow

1. Select **Native transfers**, retain `STRICT`, and edit the sender, three recipients and exact wei amounts.
2. Click **Validate & Simulate Batch**.
3. Inspect **Combined simulation and per-action outcomes**, including verified balance and recipient status.
4. Inspect the negative or positive signed result and `3 → 1` proof under **Gas comparison and submission reduction**.
5. Review the full transaction and decoded calls under **Decoded batch and unsigned transaction**.
6. Click **Prepare Unsigned Transaction**, then **Download Unsigned Transaction**. Inspect the JSON; nothing is signed or sent.
7. Use **Load Native Transfer Evidence** and **Load Native Failure Evidence** for the v1.1 Chain MCP records. The read-check buttons retain v1.0 evidence.

## Limits

- Public runtime calls latest state; Chain MCP evidence pins `eth_call` where supported, while gas estimates remain unpinned.
- Empty bytecode does not prove a human controls an address and does not prevent future contract deployment via mechanisms such as `CREATE2`.
- Native-transfer mode intentionally excludes contracts, best-effort value forwarding, ERC-20 approvals/transfers, arbitrary calldata and automatic broadcast.
- No trace/state-diff tool is available, so a reverted combined call does not support claims about internal execution order.
- One unsigned transaction is not a signature, broadcast, inclusion or state change.
