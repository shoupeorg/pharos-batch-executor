# Pharos Batch Executor

Batch Rehearsal Desk composes three or more independent zero-value checks into one actual unsigned Multicall3 transaction for Pharos Pacific Mainnet. It validates and simulates the individual checks and combined batch, decodes ordered outcomes, compares gas estimates, enforces a server-side preparation gate, and downloads one unsigned JSON transaction. It never accepts keys, signs or broadcasts.

## Verified foundation

- Network: Pharos Pacific Mainnet, chain ID `1672`, RPC `https://rpc.pharos.xyz`.
- Batch contract: Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`.
- Chain MCP verified 3,808 bytes of deployed code at block `21138166`; runtime code hash `0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891`.
- A pinned Chain MCP `eth_call` to `getChainId()` decoded to `1672`; unpinned `estimate_gas` returned `28722`. The inspected estimate schema has no block parameter, so estimates are explicitly unpinned.
- Sources: [official Pharos documentation](https://docs.pharos.xyz/), [primary Multicall3 source](https://github.com/mds1/multicall3/blob/main/src/Multicall3.sol), and saved [`evidence/foundation.json`](evidence/foundation.json).

The Pharos docs establish the network. The Multicall3 primary source establishes ABI and semantics; the Chain MCP observation establishes that this exact runtime is deployed on Pacific. The project does not assume the canonical address by convention alone.

## Supported actions

- `CHAIN_ID`: Multicall3 `getChainId()`.
- `BLOCK_NUMBER`: Multicall3 `getBlockNumber()`.
- `NATIVE_BALANCE`: Multicall3 `getEthBalance(subject)` for an explicit address.
- `REVERT_PROBE`: controlled unknown-selector call to the verified Multicall3 contract, used only to demonstrate failure handling.

Every action has value `0`. Token transfers, approvals, rewards, arbitrary calls and `aggregate3Value` are deliberately excluded. A subcall originates from Multicall3, not from the user. The supported getters do not depend on `msg.sender`; this is why individual and batched estimates are meaningfully disclosed while caller semantics remain visible.

## Failure modes

- `STRICT`: every encoded `allowFailure` is false. One subcall failure reverts the combined call. Independently successful diagnostics are labelled `ROLLED_BACK`, never committed success.
- `BEST_EFFORT`: every encoded `allowFailure` is true. The combined return contains ordered success flags and return/revert data. Preparation with a failed check requires an explicit acknowledgement.

An `eth_call` never commits state. RPC errors, timeouts, malformed responses and missing estimates remain `UNKNOWN`; they are not relabelled as EVM reverts or zero gas.

## One unsigned transaction and optimization proof

The transaction contains `chainId`, `from`, verified `to`, exact value `0`, encoded `aggregate3` calldata and a separately labelled estimate. The server decodes it back into ordered targets, calldata and `allowFailure` settings before authorization.

Gas comparison uses the same sender, zero values and comparable latest context. It reports `sum(individual estimates) − batch estimate`, including zero or negative savings. Regardless of gas, `N` individual submissions/signatures become one; for three checks the independently verifiable reduction is `3 → 1` (two fewer submissions).

## Preparation gate

`POST /api/simulate` normalizes the server-received list, verifies live chain ID and bytecode, runs individual and combined calls/estimates, and stores the report and digest in D1 for ten minutes. `POST /api/prepare` reloads that report and rejects changed, stale, consumed, wrong-chain, missing-bytecode, failed strict, incomplete or missing-gas batches. Browser claims are not trusted. A successful simulation authorizes only one unsigned download.

## Development

```powershell
npm ci
npm test
npm run build
npm run cli -- request.json
npx wrangler dev
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [SKILL.md](SKILL.md), [STATUS.md](STATUS.md), and [SUBMISSION.md](SUBMISSION.md).

## Reviewer workflow

1. Enter the sender under **1. Editable action list** and retain at least three enabled checks.
2. Choose `STRICT` or `BEST_EFFORT`, then click **Validate & Simulate Batch**.
3. Review **3. Combined simulation and per-action outcomes**.
4. Verify exact estimates and the `3 → 1` proof under **4. Gas comparison and submission reduction**.
5. Review round-trip decoded calldata under **5. Decoded batch and unsigned transaction**.
6. Click **Prepare Unsigned Transaction**, then **Download Unsigned Transaction**.
7. Use **Load Valid Live Evidence**, **Load Strict Failure Evidence**, and **Load Best Effort Evidence** for versioned live records.

## Limits

- Latest-state calls are not block-pinned in the public runtime; Chain MCP pinning is recorded where its schema supports it.
- Individual diagnostics help attribute strict failures, but they are separate calls and never prove committed per-action state.
- Gas estimates can change and are not fee guarantees.
- One prepared unsigned transaction is not a signature, broadcast, inclusion or state change.
