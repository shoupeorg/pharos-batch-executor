import { readFile } from "node:fs/promises";
import { decodeBatchTransaction, normalizeRequest } from "./engine.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run cli -- request.json");
  process.exit(1);
}
const input = JSON.parse(await readFile(file, "utf8"));
const normalized = normalizeRequest(input);
console.log(JSON.stringify({ normalized, decodedBatch: decodeBatchTransaction(normalized.transaction) }, null, 2));
