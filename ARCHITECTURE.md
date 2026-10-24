# Architecture

```text
Editable browser list (native transfers or read checks)
        |
        v
Cloudflare Worker validation ------> live Pacific JSON-RPC
        |                             chainId / sender balance / code
        |                             eth_call / estimate_gas
        v
Shared exact normalization
        |
        +--> aggregate3Value (STRICT native transfers)
        |      outer value = exact inner-value sum
        +--> aggregate3 (zero-value read checks)
        +--> round-trip full transaction decode
        +--> individual diagnostics + combined simulation
        +--> signed gas comparison + N -> 1 reduction
        |
        v
D1: canonical digest + report + expiry + prepared_at
        |
        v
Server preparation gate --conditional UPDATE--> one unsigned JSON download
```

The same engine owns validation, `BigInt` arithmetic, ABI encoding/decoding, outcome semantics, gas comparison and authorization. The public Worker uses Pacific JSON-RPC; versioned evidence uses official Chain MCP and records its schemas and pinning limitations. Both verify chain `1672` and the same Multicall3 runtime.

Security boundaries:

- No key, signature, wallet or send-transaction endpoint exists.
- Native transfers accept only positive decimal wei, nonzero empty-code recipients, empty calldata and strict `allowFailure=false`.
- Sender balance and recipient code are live preflight requirements.
- Outer value is recomputed from inner values; full `from/to/chainId/value/data` equality is required at preparation.
- Historical, changed, expired, failed, incomplete or missing-gas reports fail closed.
- D1 consumption is a conditional atomic update, so concurrent preparations yield at most one authorization.
- Value-bearing best effort, contract recipients, arbitrary calls and token approvals are absent.
