import test from "node:test";
import assert from "node:assert/strict";
import { createRpcAdapter, observeBatch } from "../src/rpc.js";
import { multicall, normalizeRequest } from "../src/engine.js";

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
test("transfer orchestration verifies balance and recipient code and sends exact values", async () => {
  const sender="0x15ddce897d76ac39c188ade4d353711a60395315",recipients=[sender,"0x1111111111111111111111111111111111111111","0x2222222222222222222222222222222222222222"];
  const normalized=normalizeRequest({workflow:"NATIVE_TRANSFERS",chainId:1672,from:sender,mode:"STRICT",actions:recipients.map(recipient=>({type:"NATIVE_TRANSFER",recipient,amountWei:"1"}))});
  const seen=[];
  const adapter={chainId:async()=>({ok:true,chainId:1672}),blockNumber:async()=>({ok:true,blockNumber:"100"}),code:async address=>address.toLowerCase()===normalized.contract.toLowerCase()?{ok:true,verified:true,isEmpty:false,codeHash:"0xabc",codeBytes:3808}:{ok:true,verified:false,isEmpty:true,codeHash:null,codeBytes:0},balance:async()=>({ok:true,balanceWei:"10"}),call:async tx=>{seen.push(["call",tx]);return{ok:true,result:tx.to===normalized.contract?multicall.encodeFunctionResult("aggregate3Value",[[{success:true,returnData:"0x"},{success:true,returnData:"0x"},{success:true,returnData:"0x"}]]):"0x"}},estimate:async tx=>{seen.push(["estimate",tx]);return{ok:true,gas:"21000"}}};
  const observed=await observeBatch(normalized,adapter,"transfer",1000);
  assert.equal(observed.senderBalance.balanceWei,"10");assert.equal(observed.recipientChecks.length,3);
  assert.deepEqual(seen.filter(([kind,tx])=>kind==="call"&&tx.to!==normalized.contract).map(([,tx])=>tx.value),["1","1","1"]);
  assert.equal(seen.find(([kind,tx])=>kind==="call"&&tx.to===normalized.contract)[1].value,"3");
});
test("recipient deployed bytecode rejects transfer orchestration before simulation", async () => {
  const sender="0x15ddce897d76ac39c188ade4d353711a60395315",recipient="0x1111111111111111111111111111111111111111";
  const normalized=normalizeRequest({workflow:"NATIVE_TRANSFERS",chainId:1672,from:sender,mode:"STRICT",actions:[sender,recipient,"0x2222222222222222222222222222222222222222"].map(recipient=>({recipient,amountWei:"1"}))});
  const adapter={chainId:async()=>({ok:true,chainId:1672}),blockNumber:async()=>({ok:true,blockNumber:"100"}),code:async address=>address.toLowerCase()===recipient.toLowerCase()?{ok:true,isEmpty:false,verified:true,codeHash:"0x1",codeBytes:1}:address.toLowerCase()===normalized.contract.toLowerCase()?{ok:true,isEmpty:false,verified:true,codeHash:"0xabc",codeBytes:3808}:{ok:true,isEmpty:true,verified:false,codeHash:null,codeBytes:0},balance:async()=>({ok:true,balanceWei:"10"})};
  await assert.rejects(()=>observeBatch(normalized,adapter,"transfer",1000),/deployed bytecode/);
});
test("insufficient verified sender balance rejects before transfer calls", async () => {
  const sender="0x15ddce897d76ac39c188ade4d353711a60395315";
  const normalized=normalizeRequest({workflow:"NATIVE_TRANSFERS",chainId:1672,from:sender,mode:"STRICT",actions:[sender,"0x1111111111111111111111111111111111111111","0x2222222222222222222222222222222222222222"].map(recipient=>({recipient,amountWei:"1"}))});
  let invoked=false;const adapter={chainId:async()=>({ok:true,chainId:1672}),blockNumber:async()=>({ok:true,blockNumber:"100"}),code:async()=>({ok:true,isEmpty:false,verified:true,codeHash:"0xabc",codeBytes:3808}),balance:async()=>({ok:true,balanceWei:"2"}),call:async()=>{invoked=true}};
  await assert.rejects(()=>observeBatch(normalized,adapter,"transfer",1000),/below required outer value/);assert.equal(invoked,false);
});
