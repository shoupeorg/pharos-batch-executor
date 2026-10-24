import { Interface, getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";
import { BATCH_CONTRACT, ENGINE_VERSION, MAX_ACTIONS, MAX_CALLDATA_BYTES, MULTICALL_ABI, NETWORK, SIMULATION_TTL_MS } from "./constants.js";

export const multicall = new Interface(MULTICALL_ABI);
const MODES = new Set(["STRICT", "BEST_EFFORT"]);
const TYPES = new Set(["CHAIN_ID", "BLOCK_NUMBER", "NATIVE_BALANCE", "REVERT_PROBE"]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digestOf = (value) => keccak256(toUtf8Bytes(canonicalJson(value)));

function cleanLabel(value, fallback) {
  const label = String(value || fallback).trim();
  if (!label || label.length > 80) throw new Error("Every action label must contain 1-80 characters.");
  return label;
}
function buildAction(input, index) {
  const type = String(input.type || "").toUpperCase();
  if (!TYPES.has(type)) throw new Error(`Action ${index + 1} has an unsupported type.`);
  const target = getAddress(BATCH_CONTRACT);
  if (type === "CHAIN_ID") return { type, label: cleanLabel(input.label, "Verify chain ID"), target, valueWei: "0", callData: multicall.encodeFunctionData("getChainId"), decoder: "getChainId" };
  if (type === "BLOCK_NUMBER") return { type, label: cleanLabel(input.label, "Read block number"), target, valueWei: "0", callData: multicall.encodeFunctionData("getBlockNumber"), decoder: "getBlockNumber" };
  if (type === "NATIVE_BALANCE") {
    if (!isAddress(input.subject || "")) throw new Error(`Action ${index + 1} requires a valid balance subject.`);
    const subject = getAddress(input.subject);
    return { type, label: cleanLabel(input.label, "Read native balance"), target, subject, valueWei: "0", callData: multicall.encodeFunctionData("getEthBalance", [subject]), decoder: "getEthBalance" };
  }
  return { type, label: cleanLabel(input.label, "Controlled revert probe"), target, valueWei: "0", callData: "0xffffffff", decoder: null, controlledFailure: true };
}

export function normalizeRequest(input) {
  if (Number(input.chainId) !== NETWORK.chainId) throw new Error(`Only ${NETWORK.name} chain ID ${NETWORK.chainId} is supported.`);
  if (!isAddress(input.from || "")) throw new Error("Sender must be a valid EVM address.");
  const mode = String(input.mode || "").toUpperCase();
  if (!MODES.has(mode)) throw new Error("Mode must be STRICT or BEST_EFFORT.");
  if (!Array.isArray(input.actions)) throw new Error("Actions must be an array.");
  const enabled = input.actions.filter((action) => action?.enabled !== false);
  if (enabled.length < 3 || enabled.length > MAX_ACTIONS) throw new Error(`Select between 3 and ${MAX_ACTIONS} enabled actions.`);
  const actions = enabled.map(buildAction);
  const calls = actions.map((action) => ({ target: action.target, allowFailure: mode === "BEST_EFFORT", callData: action.callData }));
  const data = multicall.encodeFunctionData("aggregate3", [calls]);
  if ((data.length - 2) / 2 > MAX_CALLDATA_BYTES) throw new Error("Encoded batch calldata exceeds the configured size limit.");
  return {
    chainId: NETWORK.chainId,
    from: getAddress(input.from),
    contract: getAddress(BATCH_CONTRACT),
    mode,
    actions,
    transaction: { chainId: NETWORK.chainId, from: getAddress(input.from), to: getAddress(BATCH_CONTRACT), value: "0", data },
  };
}

export function decodeBatchTransaction(transaction) {
  if (Number(transaction.chainId) !== NETWORK.chainId || getAddress(transaction.to) !== getAddress(BATCH_CONTRACT)) throw new Error("Unsigned transaction network or destination is not supported.");
  if (BigInt(transaction.value ?? 0) !== 0n) throw new Error("This release supports zero-value checks only.");
  const parsed = multicall.parseTransaction({ data: transaction.data, value: 0 });
  if (!parsed || parsed.name !== "aggregate3") throw new Error("Transaction is not a supported aggregate3 batch.");
  return parsed.args[0].map((call, order) => ({ order, target: getAddress(call.target), allowFailure: call.allowFailure, valueWei: "0", callData: call.callData }));
}

export function decodeRevertData(data) {
  if (typeof data !== "string" || !/^0x[0-9a-f]*$/i.test(data)) return null;
  try { return new Interface(["error Error(string)"]).parseError(data)?.args?.[0] || null; } catch {}
  if (data.startsWith("0x4e487b71") && data.length >= 74) return `Panic(${BigInt(`0x${data.slice(10, 74)}`).toString()})`;
  return data === "0x" ? null : data;
}

export function signedComparison(individualGas, batchGas) {
  if (individualGas.some((value) => value == null) || batchGas == null) return { available: false, reason: "One or more gas estimates are unavailable; unknown gas is never treated as zero." };
  const sum = individualGas.reduce((total, value) => total + BigInt(value), 0n);
  const batch = BigInt(batchGas);
  const difference = sum - batch;
  const basisPoints = sum === 0n ? null : difference * 10_000n / sum;
  const sign = difference > 0n ? "+" : difference < 0n ? "-" : "+";
  const absBp = basisPoints == null ? null : basisPoints < 0n ? -basisPoints : basisPoints;
  return {
    available: true,
    individualGas: individualGas.map(String),
    individualSum: sum.toString(),
    batchGas: batch.toString(),
    difference: difference.toString(),
    basisPoints: basisPoints?.toString() ?? null,
    percent: absBp == null ? "UNKNOWN" : `${sign}${absBp / 100n}.${(absBp % 100n).toString().padStart(2, "0")}%`,
  };
}

function decodedValue(action, returnData) {
  if (!action.decoder) return null;
  try { return multicall.decodeFunctionResult(action.decoder, returnData)[0].toString(); } catch { return null; }
}
function diagnosticState(result) {
  if (result?.ok) return "SUCCESS";
  if (result?.kind === "REVERT") return "REVERT";
  return "UNKNOWN";
}

export function buildReport(normalized, observation, now = Date.now()) {
  const batchCall = observation.batch?.call;
  let batchOutcome = "UNKNOWN", decodedResults = null;
  if (batchCall?.ok) {
    try {
      decodedResults = multicall.decodeFunctionResult("aggregate3", batchCall.result)[0];
      if (decodedResults.length !== normalized.actions.length) throw new Error("Result count mismatch");
      batchOutcome = "SUCCESS";
    } catch { batchOutcome = "UNKNOWN"; }
  } else if (batchCall?.kind === "REVERT") batchOutcome = "REVERT";

  const diagnostics = normalized.actions.map((action, index) => ({ action, evidence: observation.individual[index], diagnosticState: diagnosticState(observation.individual[index]?.call) }));
  let outcomes;
  if (batchOutcome === "SUCCESS" && decodedResults) {
    outcomes = diagnostics.map((item, index) => {
      const result = decodedResults[index];
      const success = Boolean(result.success);
      return { order: index, label: item.action.label, type: item.action.type, status: success ? "SUCCESS" : "REVERT", returnData: result.returnData, decodedValue: success ? decodedValue(item.action, result.returnData) : null, reason: success ? null : decodeRevertData(result.returnData) || "Subcall reverted", diagnostic: item.evidence };
    });
  } else if (normalized.mode === "STRICT" && batchOutcome === "REVERT") {
    outcomes = diagnostics.map((item, index) => ({ order: index, label: item.action.label, type: item.action.type, status: item.diagnosticState === "REVERT" ? "REVERT" : item.diagnosticState === "SUCCESS" ? "ROLLED_BACK" : "UNKNOWN", returnData: null, decodedValue: null, reason: item.diagnosticState === "REVERT" ? (item.evidence.call.error?.message || "Diagnostic call reverted") : item.diagnosticState === "SUCCESS" ? "Diagnostic succeeded independently, but the strict combined call reverted; no batch effect was committed." : "Independent diagnostic unavailable.", diagnostic: item.evidence }));
  } else {
    outcomes = diagnostics.map((item, index) => ({ order: index, label: item.action.label, type: item.action.type, status: "UNKNOWN", returnData: null, decodedValue: null, reason: "The combined result was unavailable or non-decodable; diagnostics are not substituted for a combined outcome.", diagnostic: item.evidence }));
  }

  const gas = signedComparison(observation.individual.map((item) => item.estimate?.ok ? item.estimate.gas : null), observation.batch?.estimate?.ok ? observation.batch.estimate.gas : null);
  const decoded = decodeBatchTransaction(normalized.transaction);
  const digest = digestOf(normalized);
  return {
    engineVersion: ENGINE_VERSION,
    simulationId: observation.simulationId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SIMULATION_TTL_MS).toISOString(),
    requestDigest: digest,
    network: { ...NETWORK, observationPinned: false },
    contractVerification: observation.contractVerification,
    mode: normalized.mode,
    callerSemantics: "Each inner call originates from Multicall3, not from the user. Supported getter checks do not depend on msg.sender.",
    valueSemantics: "All supported actions and the outer transaction have value 0. Value-bearing batching is intentionally disabled.",
    batchOutcome,
    combinedEvidence: observation.batch,
    actions: outcomes,
    gasComparison: gas,
    submissionReduction: { individual: normalized.actions.length, batch: 1, reduction: normalized.actions.length - 1, statement: `${normalized.actions.length} individual submissions/signatures → 1 batch submission/signature` },
    unsignedTransaction: normalized.transaction,
    decodedBatch: decoded,
  };
}

export function authorizeUnsigned(report, normalized, { now = Date.now(), acknowledgeFailures = false } = {}) {
  if (!report || report.requestDigest !== digestOf(normalized)) throw new Error("Submitted batch differs from the server-simulated request.");
  if (Number(report.network?.chainId) !== NETWORK.chainId || normalized.chainId !== NETWORK.chainId) throw new Error("Wrong-chain simulation cannot authorize preparation.");
  if (!report.contractVerification?.verified) throw new Error("Verified batch-contract bytecode is required.");
  if (now > Date.parse(report.expiresAt)) throw new Error("Simulation is stale; simulate the exact batch again.");
  if (report.batchOutcome !== "SUCCESS") throw new Error("The combined batch did not simulate successfully.");
  if (!report.gasComparison?.available || report.gasComparison.batchGas == null) throw new Error("Complete batch gas evidence is required.");
  if (report.actions.some((action) => action.status === "UNKNOWN" || action.status === "ROLLED_BACK")) throw new Error("Incomplete action outcomes cannot authorize preparation.");
  const failed = report.actions.filter((action) => action.status === "REVERT");
  if (normalized.mode === "STRICT" && failed.length) throw new Error("Strict batches with a failed action cannot be prepared.");
  if (normalized.mode === "BEST_EFFORT" && failed.length && !acknowledgeFailures) throw new Error("Explicit acknowledgement of best-effort failed actions is required.");
  const decoded = decodeBatchTransaction(report.unsignedTransaction);
  if (decoded.length !== normalized.actions.length || decoded.some((call, i) => call.target !== normalized.actions[i].target || call.callData !== normalized.actions[i].callData || call.allowFailure !== (normalized.mode === "BEST_EFFORT"))) throw new Error("Unsigned transaction does not round-trip to the normalized action list.");
  return { authorized: true, transaction: report.unsignedTransaction, decodedBatch: decoded, failedActions: failed.map((action) => action.order) };
}
