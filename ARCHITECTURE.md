# Architecture

```text
Editable browser list
        |
        v
Cloudflare Worker validation -----> live Pacific JSON-RPC
        |                            chainId / code / eth_call / estimate
        v
Shared normalization + aggregate3 encoder
        |
        +--> individual diagnostics
        +--> one combined simulation
        +--> exact gas and 3 -> 1 comparison
        |
        v
D1: digest + versioned report + expiry
        |
        v
Server preparation gate -----> one unsigned transaction download
```

The same engine defines normalized actions, encoding, decoding, outcome semantics, gas arithmetic and authorization. The public runtime uses Pacific JSON-RPC because a deployed Worker cannot invoke the local Chain MCP transport. Versioned reviewer evidence is captured through the official Chain MCP and records the exact tool names and schema limitations. Both paths verify chain `1672` and the same deployed Multicall3 address.

Security boundaries:

- No key or signature endpoint exists.
- No send-transaction method exists.
- Action vocabulary is allowlisted and zero-value.
- D1 binds preparation to the exact normalized digest and permits one export before expiry.
- STRICT and BEST_EFFORT come directly from Multicall3 `allowFailure`; value-bearing best effort is absent.
