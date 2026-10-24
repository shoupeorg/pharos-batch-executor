import test from "node:test";
import assert from "node:assert/strict";
import { createRpcAdapter } from "../src/rpc.js";

function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
test("genuine revert remains distinct from invalid params", async () => {
  const revert = createRpcAdapter("x", async () => response({ error: { code: 3, message: "execution reverted", data: "0x08c379a0" } }));
  assert.equal((await revert.call({ from: "0x0", to: "0x0", data: "0x" })).kind, "REVERT");
  const invalid = createRpcAdapter("x", async () => response({ error: { code: -32602, message: "Invalid params" } }));
  assert.equal((await invalid.call({ from: "0x0", to: "0x0", data: "0x" })).kind, "RPC_ERROR");
});
test("timeout or transport failure is not a revert", async () => {
  const adapter = createRpcAdapter("x", async () => { throw Object.assign(new Error("timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }); });
  const result = await adapter.call({ from: "0x0", to: "0x0", data: "0x" });
  assert.equal(result.kind, "TRANSPORT");
});
test("malformed estimate is rejected instead of becoming zero", async () => {
  const adapter = createRpcAdapter("x", async () => response({ result: "0x00" }));
  await assert.rejects(() => adapter.estimate({ from: "0x0", to: "0x0", data: "0x" }), /malformed/);
});
