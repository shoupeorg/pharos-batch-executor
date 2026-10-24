import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorizeUnsigned, buildReport, decodeBatchTransaction, multicall, normalizeRequest } from "../src/engine.js";
import { BATCH_CONTRACT } from "../src/constants.js";

const sender="0x15ddce897d76ac39c188ade4d353711a60395315";
const recipients=[sender,"0x1111111111111111111111111111111111111111","0x2222222222222222222222222222222222222222"];
const input=(actions=recipients.map((recipient,i)=>({type:"NATIVE_TRANSFER",recipient,amountWei:String(i+1),label:`Transfer ${i+1}`})))=>({workflow:"NATIVE_TRANSFERS",chainId:1672,from:sender,contract:BATCH_CONTRACT,mode:"STRICT",actions});
function observation(normalized,{batch="SUCCESS",gas=[21000,21000,21000],batchGas=90000,balance="1000000000000000000"}={}){
  const results=normalized.actions.map(()=>({success:true,returnData:"0x"}));
  return {simulationId:"transfer-sim",contractVerification:{verified:true,address:BATCH_CONTRACT,codeHash:"0xabc",codeBytes:3808,verificationBlock:"21144392"},senderBalance:{ok:true,balanceWei:balance},recipientChecks:normalized.actions.map(a=>({recipient:a.recipient,code:{ok:true,isEmpty:true,result:"0x"}})),individual:normalized.actions.map((a,i)=>({transaction:{from:normalized.from,to:a.target,value:a.valueWei,data:"0x"},call:{ok:true,result:"0x"},estimate:gas[i]==null?{ok:false,kind:"RPC_ERROR"}:{ok:true,gas:String(gas[i])}})),batch:{transaction:normalized.transaction,call:batch==="SUCCESS"?{ok:true,result:multicall.encodeFunctionResult("aggregate3Value",[results])}:{ok:false,kind:"REVERT",error:{code:3,message:"execution reverted: Multicall3: value mismatch",data:"0x"}},estimate:batchGas==null?{ok:false,kind:"RPC_ERROR"}:{ok:true,gas:String(batchGas)}}};
}

test("three configurable transfers encode aggregate3Value with exact sum and strict flags",()=>{
  const normalized=normalizeRequest(input());
  assert.equal(normalized.workflow,"NATIVE_TRANSFERS");
  assert.equal(normalized.transaction.value,"6");
  assert.ok(normalized.transaction.data.startsWith(multicall.getFunction("aggregate3Value").selector));
  assert.deepEqual(decodeBatchTransaction(normalized.transaction),normalized.actions.map((a,order)=>({order,target:a.target,allowFailure:false,valueWei:a.valueWei,callData:"0x"})));
});

test("native transfers reject best effort, invalid recipients, zero/malformed/negative/overflow amounts and short lists",()=>{
  assert.throws(()=>normalizeRequest({...input(),mode:"BEST_EFFORT"}),/STRICT/);
  assert.throws(()=>normalizeRequest(input([{recipient:"0x0000000000000000000000000000000000000000",amountWei:"1"},...input().actions.slice(1)])),/zero address/);
  for(const amountWei of ["0","-1","1.1",1,"01",(1n<<256n).toString()]) assert.throws(()=>normalizeRequest(input([{recipient:recipients[0],amountWei},...input().actions.slice(1)])));
  assert.throws(()=>normalizeRequest(input(input().actions.slice(0,2))),/between 3/);
});

test("verified sender balance and empty-code recipients are required",()=>{
  const normalized=normalizeRequest(input()),report=buildReport(normalized,observation(normalized),1000);
  report.preflight.sufficientBalance=false;
  assert.throws(()=>authorizeUnsigned(report,normalized,{now:1100}),/sender balance/);
  report.preflight.sufficientBalance=true;report.preflight.recipientsSupported=false;
  assert.throws(()=>authorizeUnsigned(report,normalized,{now:1100}),/recipient/);
});

test("combined success models three transfers but a combined revert leaves action order unknown",()=>{
  const normalized=normalizeRequest(input());
  const success=buildReport(normalized,observation(normalized),1000);
  assert.deepEqual(success.actions.map(x=>x.status),["SUCCESS","SUCCESS","SUCCESS"]);
  const failed=buildReport(normalized,observation(normalized,{batch:"REVERT",batchGas:null}),1000);
  assert.equal(failed.batchOutcome,"REVERT");
  assert.deepEqual(failed.actions.map(x=>x.status),["UNKNOWN","UNKNOWN","UNKNOWN"]);
  assert.throws(()=>authorizeUnsigned(failed,normalized,{now:1100}),/did not simulate successfully/);
});

test("unknown transfer gas is not zero and blocks preparation",()=>{
  const normalized=normalizeRequest(input()),report=buildReport(normalized,observation(normalized,{gas:[21000,null,21000]}),1000);
  assert.equal(report.gasComparison.available,false);
  assert.throws(()=>authorizeUnsigned(report,normalized,{now:1100}),/gas evidence/);
});

test("full transaction tampering in sender, destination, chain, value or data is rejected",()=>{
  const normalized=normalizeRequest(input());
  for(const mutation of [
    tx=>tx.from=recipients[1],tx=>tx.to=recipients[1],tx=>tx.chainId=688689,tx=>tx.value="7",tx=>tx.data=tx.data.slice(0,-1)+(tx.data.endsWith("0")?"1":"0"),
  ]){const report=buildReport(normalized,observation(normalized),1000);mutation(report.unsignedTransaction);assert.throws(()=>authorizeUnsigned(report,normalized,{now:1100}),/full unsigned transaction|round-trip/)}
});

test("invalid timestamps and historical evidence never authorize",()=>{
  const normalized=normalizeRequest(input());
  const bad=buildReport(normalized,observation(normalized),1000);bad.expiresAt="not-a-date";assert.throws(()=>authorizeUnsigned(bad,normalized,{now:1100}),/timestamps/);
  const historical=buildReport(normalized,observation(normalized),1000);historical.historical=true;assert.throws(()=>authorizeUnsigned(historical,normalized,{now:1100}),/Historical/);
});

test("contract changes are rejected and a valid transfer report authorizes exact transaction",()=>{
  assert.throws(()=>normalizeRequest({...input(),contract:recipients[1]}),/verified Multicall3/);
  const normalized=normalizeRequest(input()),report=buildReport(normalized,observation(normalized),1000),authorized=authorizeUnsigned(report,normalized,{now:1100});
  assert.equal(authorized.authorized,true);assert.deepEqual(authorized.transaction,normalized.transaction);
});

test("form change handlers invalidate preparation and duplicate simulation is guarded",async()=>{
  const app=await readFile(new URL("../public/app.js",import.meta.url),"utf8");
  assert.match(app,/function invalidate/);assert.match(app,/onchange=.*invalidate/);assert.match(app,/if\(busy\)return/);
});
