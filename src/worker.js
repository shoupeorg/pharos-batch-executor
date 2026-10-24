import { ENGINE_VERSION, NETWORK, BATCH_CONTRACT, SIMULATION_TTL_MS } from "./constants.js";
import { authorizeUnsigned, buildReport, digestOf, normalizeRequest } from "./engine.js";
import { createRpcAdapter, observeBatch } from "./rpc.js";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers });
async function body(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Content-Type must be application/json.");
  return request.json();
}

async function simulate(request, env) {
  const submitted = await body(request);
  const normalized = normalizeRequest(submitted);
  const simulationId = crypto.randomUUID();
  const now = Date.now();
  const observation = await observeBatch(normalized, createRpcAdapter(env.RPC_URL || NETWORK.rpcUrl), simulationId, now);
  const report = buildReport(normalized, observation, now);
  await env.DB.prepare("INSERT INTO simulations (id,digest,report_json,created_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(simulationId, digestOf(normalized), JSON.stringify(report), now, now + SIMULATION_TTL_MS).run();
  return json({ report });
}

async function prepare(request, env) {
  const submitted = await body(request);
  if (typeof submitted.simulationId !== "string") throw new Error("simulationId is required.");
  const row = await env.DB.prepare("SELECT * FROM simulations WHERE id=?").bind(submitted.simulationId).first();
  if (!row) throw new Error("Simulation was not found.");
  if (row.prepared_at) throw new Error("This simulation has already authorized one unsigned export.");
  const normalized = normalizeRequest(submitted.request);
  if (row.digest !== digestOf(normalized)) throw new Error("Changed request cannot use the saved simulation.");
  const report = JSON.parse(row.report_json);
  const result = authorizeUnsigned(report, normalized, { acknowledgeFailures: submitted.acknowledgeFailures === true });
  const updated = await env.DB.prepare("UPDATE simulations SET prepared_at=? WHERE id=? AND prepared_at IS NULL AND expires_at>=?").bind(Date.now(), row.id, Date.now()).run();
  if (updated.meta.changes !== 1) throw new Error("Simulation expired or was already consumed.");
  return json({ engineVersion: ENGINE_VERSION, simulationId: row.id, preparedAt: new Date().toISOString(), ...result });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/meta" && request.method === "GET") return json({ engineVersion: ENGINE_VERSION, network: NETWORK, batchContract: BATCH_CONTRACT, modes: ["STRICT", "BEST_EFFORT"], actionTypes: ["CHAIN_ID", "BLOCK_NUMBER", "NATIVE_BALANCE", "REVERT_PROBE"], publicMode: "unsigned preparation only", runtimeTransport: "Pharos Pacific JSON-RPC", evidenceTransport: "official Chain MCP" });
  if (url.pathname === "/api/simulate" && request.method === "POST") return simulate(request, env);
  if (url.pathname === "/api/prepare" && request.method === "POST") return prepare(request, env);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) { return json({ error: error.message || "Request failed", engineVersion: ENGINE_VERSION }, /not found/i.test(error.message) ? 404 : 400); }
  },
};
