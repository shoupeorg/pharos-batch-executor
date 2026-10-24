import test from "node:test";
import assert from "node:assert/strict";
import { authorizeUnsigned, buildReport, decodeBatchTransaction, multicall, normalizeRequest, signedComparison } from "../src/engine.js";
import { BATCH_CONTRACT } from "../src/constants.js";

const sender = "0x15ddce897d76ac39c188ade4d353711a60395315";
const base = (mode = "STRICT", actions) => ({
  chainId: 1672,
  from: sender,
  mode,
  actions: actions || [
    { type: "CHAIN_ID", label: "Chain" },
    { type: "BLOCK_NUMBER", label: "Block" },
    { type: "NATIVE_BALANCE", label: "Balance", subject: sender },
  ],
});
const returnFor = (action) => action.type === "CHAIN_ID" ? multicall.encodeFunctionResult("getChainId", [1672n]) : action.type === "BLOCK_NUMBER" ? multicall.encodeFunctionResult("getBlockNumber", [21138166n]) : action.type === "NATIVE_BALANCE" ? multicall.encodeFunctionResult("getEthBalance", [123n]) : "0x";
function observation(normalized, { batch = "SUCCESS", failed = [], gas = [28000, 28000, 30000], batchGas = 65000, kind = "REVERT" } = {}) {
  const results = normalized.actions.map((action, index) => ({ success: !failed.includes(index), returnData: failed.includes(index) ? "0x" : returnFor(action) }));
  return {
    simulationId: "sim-1",
    contractVerification: { verified: true, address: BATCH_CONTRACT, codeHash: "0xabc", codeBytes: 3000, verificationBlock: "21138166" },
    individual: normalized.actions.map((action, index) => ({ transaction: { from: normalized.from, to: action.target, data: action.callData, value: "0" }, call: failed.includes(index) ? { ok: false, kind, error: { code: 3, message: "execution reverted", data: "0x" } } : { ok: true, result: returnFor(action) }, estimate: gas[index] == null ? { ok: false, kind: "RPC_ERROR", error: { message: "unavailable" } } : { ok: true, gas: String(gas[index]) } })),
    batch: { transaction: normalized.transaction, call: batch === "SUCCESS" ? { ok: true, result: multicall.encodeFunctionResult("aggregate3", [results]) } : { ok: false, kind, error: { code: 3, message: "execution reverted: Multicall3: call failed", data: "0x" } }, estimate: batchGas == null ? { ok: false, kind: "RPC_ERROR", error: { message: "unavailable" } } : { ok: true, gas: String(batchGas) } },
  };
}

test("accepts at least three enabled independent actions", () => assert.equal(normalizeRequest(base()).actions.length, 3));
test("rejects fewer than three enabled actions", () => assert.throws(() => normalizeRequest(base("STRICT", [{ type: "CHAIN_ID" }, { type: "BLOCK_NUMBER" }]))));
test("rejects unsupported actions and invalid addresses", () => {
  assert.throws(() => normalizeRequest(base("STRICT", [{ type: "CHAIN_ID" }, { type: "BLOCK_NUMBER" }, { type: "RAW" }])));
  assert.throws(() => normalizeRequest({ ...base(), from: "bad" }));
});
test("encodes one transaction and round-trips ordered calls", () => {
  const normalized = normalizeRequest(base());
  const decoded = decodeBatchTransaction(normalized.transaction);
  assert.equal(decoded.length, 3);
  assert.deepEqual(decoded.map((item) => item.callData), normalized.actions.map((item) => item.callData));
  assert.ok(normalized.transaction.data.startsWith(multicall.getFunction("aggregate3").selector));
});
test("total forwarded value is exactly zero and best effort maps allowFailure", () => {
  const strict = normalizeRequest(base("STRICT")), best = normalizeRequest(base("BEST_EFFORT"));
  assert.equal(strict.transaction.value, "0");
  assert.deepEqual(decodeBatchTransaction(strict.transaction).map((x) => x.allowFailure), [false, false, false]);
  assert.deepEqual(decodeBatchTransaction(best.transaction).map((x) => x.allowFailure), [true, true, true]);
});
test("native balance encodes the explicit subject and never user-token authority", () => {
  const normalized = normalizeRequest(base());
  assert.equal(normalized.actions[2].target, BATCH_CONTRACT);
  assert.equal(normalized.actions[2].subject.toLowerCase(), sender.toLowerCase());
  assert.equal(normalized.actions[2].valueWei, "0");
});
test("strict failure does not invent execution order and blocks preparation", () => {
  const normalized = normalizeRequest(base("STRICT", [{ type: "CHAIN_ID" }, { type: "REVERT_PROBE" }, { type: "BLOCK_NUMBER" }]));
  const report = buildReport(normalized, observation(normalized, { batch: "REVERT", failed: [1] }), 1000);
  assert.equal(report.batchOutcome, "REVERT");
  assert.deepEqual(report.actions.map((x) => x.status), ["UNKNOWN", "REVERT", "UNKNOWN"]);
  assert.throws(() => authorizeUnsigned(report, normalized, { now: 1100 }), /did not simulate successfully/);
});
test("best effort decodes explicit partial failure and requires acknowledgement", () => {
  const normalized = normalizeRequest(base("BEST_EFFORT", [{ type: "CHAIN_ID" }, { type: "REVERT_PROBE" }, { type: "BLOCK_NUMBER" }]));
  const report = buildReport(normalized, observation(normalized, { failed: [1] }), 1000);
  assert.deepEqual(report.actions.map((x) => x.status), ["SUCCESS", "REVERT", "SUCCESS"]);
  assert.throws(() => authorizeUnsigned(report, normalized, { now: 1100 }), /acknowledgement/);
  assert.equal(authorizeUnsigned(report, normalized, { now: 1100, acknowledgeFailures: true }).authorized, true);
});
test("missing gas remains unknown and blocks unsigned preparation", () => {
  const normalized = normalizeRequest(base());
  const report = buildReport(normalized, observation(normalized, { gas: [28000, null, 30000] }), 1000);
  assert.equal(report.gasComparison.available, false);
  assert.throws(() => authorizeUnsigned(report, normalized, { now: 1100 }), /gas evidence/);
});
test("gas comparison reports positive, zero and negative results exactly", () => {
  assert.equal(signedComparison(["30000", "30000", "30000"], "60000").percent, "+33.33%");
  assert.equal(signedComparison(["30000", "30000", "30000"], "90000").percent, "+0.00%");
  assert.equal(signedComparison(["30000", "30000", "30000"], "120000").percent, "-33.33%");
});
test("submission reduction is 3 to 1", () => {
  const normalized = normalizeRequest(base());
  const report = buildReport(normalized, observation(normalized), 1000);
  assert.deepEqual(report.submissionReduction, { individual: 3, batch: 1, reduction: 2, statement: "3 individual submissions/signatures → 1 batch submission/signature" });
});
test("wrong network is rejected", () => assert.throws(() => normalizeRequest({ ...base(), chainId: 688689 }), /Only Pharos Pacific/));
test("transport failure is UNKNOWN, never an EVM revert", () => {
  const normalized = normalizeRequest(base());
  const report = buildReport(normalized, observation(normalized, { batch: "FAIL", kind: "TRANSPORT", batchGas: null }), 1000);
  assert.equal(report.batchOutcome, "UNKNOWN");
  assert.ok(report.actions.every((action) => action.status === "UNKNOWN"));
});
test("changed request cannot reuse a report", () => {
  const normalized = normalizeRequest(base()), report = buildReport(normalized, observation(normalized), 1000);
  const changed = normalizeRequest({ ...base(), mode: "BEST_EFFORT" });
  assert.throws(() => authorizeUnsigned(report, changed, { now: 1100 }), /differs/);
});
test("stale simulation cannot authorize preparation", () => {
  const normalized = normalizeRequest(base()), report = buildReport(normalized, observation(normalized), 1000);
  assert.throws(() => authorizeUnsigned(report, normalized, { now: Date.parse(report.expiresAt) + 1 }), /stale/);
});
test("missing verified bytecode fails closed", () => {
  const normalized = normalizeRequest(base()), report = buildReport(normalized, observation(normalized), 1000);
  report.contractVerification.verified = false;
  assert.throws(() => authorizeUnsigned(report, normalized, { now: 1100 }), /bytecode/);
});
test("successful strict simulation authorizes one exact decoded unsigned transaction", () => {
  const normalized = normalizeRequest(base()), report = buildReport(normalized, observation(normalized), 1000);
  const authorized = authorizeUnsigned(report, normalized, { now: 1100 });
  assert.equal(authorized.authorized, true);
  assert.equal(authorized.decodedBatch.length, 3);
  assert.deepEqual(authorized.failedActions, []);
});
