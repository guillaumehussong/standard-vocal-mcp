// Local test runner — exercises run_eval against the real assistant without the MCP layer.
import { setVapiToken } from "./vapi.js";
import { runEval, setLLM } from "./eval.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenarios = JSON.parse(
  readFileSync(join(__dirname, "..", "evals", "scenarios.json"), "utf8")
);

const ASSISTANT_ID = "c7e088ff-8fe9-417c-ab31-d8bb6bf4e96b";
const token = process.env.VAPI_TOKEN || process.env.VAPI_API_KEY;
if (!token) {
  console.error("Set VAPI_TOKEN");
  process.exit(1);
}
setVapiToken(token);
setLLM({ apiKey: process.env.OPENAI_API_KEY || token, baseURL: "https://api.openai.com/v1" });

console.log("Running eval (elagueur scenarios) against", ASSISTANT_ID, "...\n");
const report = await runEval(ASSISTANT_ID, scenarios.elagueur);

console.log("═".repeat(60));
console.log(`GRADE: ${report.grade}/100  →  ${report.verdict}`);
console.log("═".repeat(60));
for (const sc of report.scenarios) {
  console.log(`\n[${sc.score}/${sc.maxScore}] ${sc.label}`);
  for (const chk of sc.passed) {
    console.log(`   ${chk.ok ? "✓" : "✗"} ${chk.check}`);
  }
  console.log("   --- turns ---");
  for (const t of sc.turns) {
    console.log(`   U: ${t.user}`);
    console.log(`   A: ${t.assistant.slice(0, 160)}${t.assistant.length > 160 ? "…" : ""}`);
  }
}
console.log("\n" + "═".repeat(60));
