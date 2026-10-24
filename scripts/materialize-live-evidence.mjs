import { mkdir, readFile, writeFile } from "node:fs/promises";
import { authorizeUnsigned, buildReport, multicall, normalizeRequest } from "../src/engine.js";
import { BATCH_CONTRACT } from "../src/constants.js";

const capturedAt = new Date().toISOString();
const sender = "0x15ddce897d76ac39c188ade4d353711a60395315";
const successActions = [
  { type: "CHAIN_ID", label: "Verify Pacific chain ID" },
  { type: "BLOCK_NUMBER", label: "Read current block number" },
  { type: "NATIVE_BALANCE", label: "Read sender native balance", subject: sender },
];
const failureActions = [
  { type: "CHAIN_ID", label: "Verify Pacific chain ID" },
  { type: "REVERT_PROBE", label: "Controlled revert probe" },
  { type: "BLOCK_NUMBER", label: "Read current block number" },
];
const chainResult = "0x" + 1672n.toString(16).padStart(64, "0");
const blockResult = "0x" + 21139261n.toString(16).padStart(64, "0");
const batchBlockResult = "0x" + 21139263n.toString(16).padStart(64, "0");
const balanceResult = "0x000000000000000000000000000000000000000000000009cde17c2ed698d3bf";
const revertError = { ok: false, kind: "REVERT", error: { message: "execution reverted: ", code: 3, data: "0x" } };
const strictError = { ok: false, kind: "REVERT", error: { message: "execution reverted: Multicall3: call failed", code: 3, data: "0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000174d756c746963616c6c333a2063616c6c206661696c6564000000000000000000" } };
const ok = (result) => ({ ok: true, result });
const estimate = (gas) => ({ ok: true, gas: String(gas), result: `0x${BigInt(gas).toString(16)}` });
const failedEstimate = { ok: false, kind: "REVERT", error: revertError.error };
const verified = { verified: true, address: BATCH_CONTRACT, codeHash: "0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891", codeBytes: 3808, verificationBlock: "21139320" };

function item(normalized, index, call, gas) {
  const action = normalized.actions[index];
  return { transaction: { from: normalized.from, to: action.target, value: "0", data: action.callData }, call, estimate: gas == null ? failedEstimate : estimate(gas) };
}
function envelope(kind, normalized, observation, report, preparation = null) {
  return {
    schemaVersion: "batch-live-evidence/1.0.0",
    capturedAt,
    historical: true,
    readOnly: true,
    transport: "official Chain MCP",
    tools: { call: "eth_call", estimate: "estimate_gas", block: "get_block_number" },
    schemaLimitations: { ethCallBlockParameter: true, estimateGasBlockParameter: false, mainCaptureEstimatePinned: false },
    captureBlockWindowEnd: "21139320",
    kind,
    normalizedRequest: normalized,
    observation,
    report,
    preparation,
    disclaimer: "eth_call and estimate_gas do not commit state. No transaction was signed or broadcast.",
  };
}

const valid = normalizeRequest({ chainId: 1672, from: sender, mode: "STRICT", actions: successActions });
const validResults = [chainResult, batchBlockResult, balanceResult];
const validObservation = {
  simulationId: "chain-mcp-valid-v1",
  observedAt: capturedAt,
  blockContext: { tag: "latest", blockNumber: "21139320", estimatePinned: false },
  contractVerification: verified,
  individual: [item(valid, 0, ok(chainResult), 28722), item(valid, 1, ok(blockResult), 28802), item(valid, 2, ok(balanceResult), 29436)],
  batch: { transaction: valid.transaction, call: ok(multicall.encodeFunctionResult("aggregate3", [validResults.map((returnData) => ({ success: true, returnData }))])), estimate: estimate(41480) },
};
const validReport = buildReport(valid, validObservation);
const validPreparation = authorizeUnsigned(validReport, valid, { now: Date.now() });

const strict = normalizeRequest({ chainId: 1672, from: sender, mode: "STRICT", actions: failureActions });
const strictObservation = {
  simulationId: "chain-mcp-strict-failure-v1",
  observedAt: capturedAt,
  blockContext: { tag: "latest", blockNumber: "21139320", estimatePinned: false },
  contractVerification: verified,
  individual: [item(strict, 0, ok(chainResult), 28722), item(strict, 1, revertError, null), item(strict, 2, ok(blockResult), 28802)],
  batch: { transaction: strict.transaction, call: strictError, estimate: strictError },
};
const strictReport = buildReport(strict, strictObservation);

const best = normalizeRequest({ chainId: 1672, from: sender, mode: "BEST_EFFORT", actions: failureActions });
const bestResults = [{ success: true, returnData: chainResult }, { success: false, returnData: "0x" }, { success: true, returnData: batchBlockResult }];
const bestObservation = {
  simulationId: "chain-mcp-best-effort-v1",
  observedAt: capturedAt,
  blockContext: { tag: "latest", blockNumber: "21139320", estimatePinned: false },
  contractVerification: verified,
  individual: [item(best, 0, ok(chainResult), 28722), item(best, 1, revertError, null), item(best, 2, ok(blockResult), 28802)],
  batch: { transaction: best.transaction, call: ok(multicall.encodeFunctionResult("aggregate3", [bestResults])), estimate: estimate(40583) },
};
const bestReport = buildReport(best, bestObservation);

const records = {
  "live-valid": envelope("VALID_STRICT", valid, validObservation, validReport, validPreparation),
  "live-strict-failure": envelope("STRICT_ROLLBACK", strict, strictObservation, strictReport),
  "live-best-effort": envelope("BEST_EFFORT_PARTIAL_FAILURE", best, bestObservation, bestReport),
};
await mkdir("public/evidence", { recursive: true });
for (const [name, record] of Object.entries(records)) {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  await writeFile(`evidence/${name}.json`, text);
  await writeFile(`public/evidence/${name}.json`, text);
}
await writeFile("public/evidence/foundation.json", await readFile("evidence/foundation.json"));
const manifest = {
  schemaVersion: "batch-evidence-manifest/1.0.0",
  capturedAt,
  contract: verified,
  records: Object.fromEntries(Object.entries(records).map(([name, record]) => [name, { kind: record.kind, batchOutcome: record.report.batchOutcome, actions: record.report.actions.map((action) => action.status), unsignedPrepared: Boolean(record.preparation), path: `evidence/${name}.json` }])),
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile("evidence/manifest-v1.json", manifestText);
await writeFile("public/evidence/manifest-v1.json", manifestText);
console.log(JSON.stringify(manifest, null, 2));
