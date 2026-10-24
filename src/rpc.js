import { keccak256 } from "ethers";
import { BATCH_CONTRACT, NETWORK } from "./constants.js";

function quantity(value, field) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error(`${field} returned a malformed RPC quantity.`);
  return BigInt(value).toString();
}
function rpcFailure(error) {
  const message = String(error?.message || "RPC request failed");
  const data = typeof error?.data === "string" ? error.data : error?.data?.data;
  const revert = (error?.code === 3 || /execution reverted|revert/i.test(message)) && (typeof data === "string" || /revert/i.test(message));
  return { ok: false, kind: revert ? "REVERT" : "RPC_ERROR", error: { code: error?.code ?? null, message, data: data ?? null } };
}

export function createRpcAdapter(url = NETWORK.rpcUrl, fetchImpl = fetch) {
  let id = 0;
  async function raw(method, params) {
    try {
      const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return { ok: false, kind: "TRANSPORT", error: { code: response.status, message: `HTTP ${response.status}`, data: null } };
      const body = await response.json();
      if (body.error) return rpcFailure(body.error);
      if (body.result == null) return { ok: false, kind: "MALFORMED", error: { code: null, message: "RPC response omitted result.", data: null } };
      return { ok: true, result: body.result };
    } catch (error) { return { ok: false, kind: "TRANSPORT", error: { code: error?.code || null, message: error?.message || String(error), data: null } }; }
  }
  return {
    async chainId() { const result = await raw("eth_chainId", []); return result.ok ? { ...result, chainId: Number(BigInt(result.result)) } : result; },
    async blockNumber() { const result = await raw("eth_blockNumber", []); return result.ok ? { ...result, blockNumber: quantity(result.result, "eth_blockNumber") } : result; },
    async code(address) { const result = await raw("eth_getCode", [address, "latest"]); return result.ok ? { ...result, verified: result.result !== "0x", codeHash: result.result === "0x" ? null : keccak256(result.result), codeBytes: (result.result.length - 2) / 2 } : result; },
    async call(transaction) { return raw("eth_call", [{ from: transaction.from, to: transaction.to, value: "0x0", data: transaction.data }, "latest"]); },
    async estimate(transaction) { const result = await raw("eth_estimateGas", [{ from: transaction.from, to: transaction.to, value: "0x0", data: transaction.data }]); return result.ok ? { ...result, gas: quantity(result.result, "eth_estimateGas") } : result; },
  };
}

export async function observeBatch(normalized, adapter, simulationId, now = Date.now()) {
  const [chain, block, code] = await Promise.all([adapter.chainId(), adapter.blockNumber(), adapter.code(BATCH_CONTRACT)]);
  if (!chain.ok) throw new Error(`Network verification unavailable: ${chain.error.message}`);
  if (chain.chainId !== NETWORK.chainId) throw new Error(`RPC chain ${chain.chainId} does not match ${NETWORK.chainId}.`);
  if (!code.ok || !code.verified) throw new Error("Verified Multicall3 bytecode is unavailable.");
  const individual = await Promise.all(normalized.actions.map(async (action) => {
    const transaction = { from: normalized.from, to: action.target, value: "0", data: action.callData };
    const [call, estimate] = await Promise.all([adapter.call(transaction), adapter.estimate(transaction)]);
    return { transaction, call, estimate };
  }));
  const [call, estimate] = await Promise.all([adapter.call(normalized.transaction), adapter.estimate(normalized.transaction)]);
  return { simulationId, observedAt: new Date(now).toISOString(), blockContext: block.ok ? { tag: "latest", blockNumber: block.blockNumber } : { tag: "latest", blockNumber: null, error: block.error }, contractVerification: { verified: true, address: BATCH_CONTRACT, codeHash: code.codeHash, codeBytes: code.codeBytes, verificationBlock: block.ok ? block.blockNumber : null }, individual, batch: { transaction: normalized.transaction, call, estimate } };
}
