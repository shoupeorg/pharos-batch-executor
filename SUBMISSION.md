# Submission notes

Pharos Batch Executor prepares three or more configurable native transfers inside one strict unsigned Multicall3 `aggregate3Value` transaction on Pacific Mainnet. It verifies live sender balance and empty recipient bytecode, enforces exact outer value, simulates individual and combined execution, round-trip decodes every call, reports honest signed gas comparison, and conditionally consumes a server-stored simulation before one unsigned download.

The real v1.1 evidence shows three `1 wei` transfers: `63000` individual estimated gas versus `101286` combined (`-38286`, `-60.77%`). Batching is more expensive in this example, while still reducing three submissions/signatures to one. A controlled `4 wei` outer value against a `3 wei` inner sum genuinely reverts with `Multicall3: value mismatch`; without a trace, per-action order remains `UNKNOWN`, and no transfer is claimed committed.

Supplementary zero-value read checks retain STRICT/BEST_EFFORT demonstrations. The app has no keys, signing, approvals or broadcasting. Historical evidence is review-only and cannot authorize a new export.
