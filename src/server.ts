/**
 * Shared MCP server factory — used by the stdio entry (index.ts, npm package)
 * and the hosted HTTP entry (http.ts, tecn0 demo server).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { setVapiToken, vapiGet } from "./vapi.js";
import { deployAgent } from "./deploy.js";
import { runEval, setLLM } from "./eval.js";
import { audioForensics } from "./forensics.js";
import { promptSnapshot, promptDiff, promptRollback } from "./versioning.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const evalScenarios = JSON.parse(
  readFileSync(join(__dirname, "..", "evals", "scenarios.json"), "utf8")
);
const markets = JSON.parse(
  readFileSync(join(__dirname, "..", "verticals", "templates.json"), "utf8")
);

/** Wire env vars into the tool backends. Call once per process. */
export function bootstrapEnv(): void {
  const VAPI_TOKEN = process.env.VAPI_TOKEN || process.env.VAPI_API_KEY;
  if (!VAPI_TOKEN) {
    console.error("Missing VAPI_TOKEN (or VAPI_API_KEY) env var");
    process.exit(1);
  }
  setVapiToken(VAPI_TOKEN);

  // LLM for run_eval (OpenAI-compatible; the assistant's model is gpt-4.1 by default)
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (OPENAI_KEY) {
    setLLM({ apiKey: OPENAI_KEY, baseURL: "https://api.openai.com/v1" });
  } else {
    console.error("Warning: OPENAI_API_KEY not set — run_eval / regression_gate will fail");
  }
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_agents",
    description:
      "List the Vapi assistants on this account: name, id, model, voice, transcriber, creation date. Start here to find the assistantId for run_eval / prompt_diff / regression_gate.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "deploy_agent",
    description:
      "Deploy a full production phone agent for a market (fr, us, sv) and a vertical. Available verticals — fr: elagueur, plombier, dentiste, veterinaire. us: plumber, tree-service, dentiste, veterinaire. sv: plombier, dentiste, veterinaire. Creates the Vapi assistant with prompt, voice, transcriber and keywords baked in. One call = one working agent.",
    inputSchema: {
      type: "object",
      properties: {
        market: { type: "string", enum: ["fr", "us", "sv"] },
        vertical: { type: "string" },
        company: { type: "string", description: "Company name shown to callers" },
        extraKeywords: { type: "array", items: { type: "string" }, description: "Location names / street names to boost transcription" },
        voiceIdOverride: { type: "string" },
        name: { type: "string" },
      },
      required: ["market", "vertical", "company"],
    },
  },
  {
    name: "run_eval",
    description:
      "The agent tests itself. Simulates N scripted scenarios via the LLM (no audio cost), scores behavior (close speed, no price, spelled confirmation, urgency handling), returns a /100 report with PASS/WARN/FAIL.",
    inputSchema: {
      type: "object",
      properties: {
        assistantId: { type: "string" },
        market: { type: "string", enum: ["fr", "us", "sv"] },
        vertical: { type: "string" },
      },
      required: ["assistantId", "market", "vertical"],
    },
  },
  {
    name: "audio_forensics",
    description:
      "Download the 3 recording tracks of a call (mono/customer/assistant), run RMS analysis, and locate the noise source. Automates the manual audio investigation.",
    inputSchema: {
      type: "object",
      properties: { callId: { type: "string" } },
      required: ["callId"],
    },
  },
  {
    name: "prompt_diff",
    description:
      "Version and diff assistant prompts. snapshot = capture current prompt from Vapi into local history. diff = compare two versions. rollback = push an old prompt back.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["snapshot", "diff", "rollback"] },
        assistantId: { type: "string" },
        fromVersion: { type: "string" },
        toVersion: { type: "string" },
      },
      required: ["action", "assistantId"],
    },
  },
  {
    name: "regression_gate",
    description:
      "CI for prompts. Runs run_eval against the current assistant and blocks the update if the score regressed vs the stored baseline. Returns allow/deny.",
    inputSchema: {
      type: "object",
      properties: {
        assistantId: { type: "string" },
        market: { type: "string", enum: ["fr", "us", "sv"] },
        vertical: { type: "string" },
        baselineScore: { type: "number", description: "Previous accepted grade /100" },
      },
      required: ["assistantId", "market", "vertical", "baselineScore"],
    },
  },
];

// ─── Server factory ──────────────────────────────────────────────────────────

export function createServer(): Server {
  const server = new Server(
    { name: "standard-vocal-mcp", version: "0.3.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const out = (data: unknown) => ({
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    });

    try {
      switch (name) {
        case "list_agents": {
          const assistants = (await vapiGet("/assistant")) as Record<string, unknown>[];
          return out(
            assistants.map((a) => ({
              id: a.id,
              agentName: a.name,
              model: (a.model as Record<string, unknown>)?.model,
              voice: (a.voice as Record<string, unknown>)?.voiceId,
              voiceProvider: (a.voice as Record<string, unknown>)?.provider,
              transcriber: `${(a.transcriber as Record<string, unknown>)?.provider} / ${(a.transcriber as Record<string, unknown>)?.language}`,
              createdAt: a.createdAt,
            }))
          );
        }

        case "deploy_agent": {
          const p = z
            .object({
              market: z.enum(["fr", "us", "sv"]),
              vertical: z.string(),
              company: z.string(),
              extraKeywords: z.array(z.string()).optional(),
              voiceIdOverride: z.string().optional(),
              name: z.string().optional(),
            })
            .parse(args);
          return out(await deployAgent(p));
        }

        case "run_eval": {
          const p = z
            .object({
              assistantId: z.string(),
              market: z.enum(["fr", "us", "sv"]),
              vertical: z.string(),
            })
            .parse(args);
          const scenarios = evalScenarios[p.market]?.[p.vertical];
          if (!scenarios) throw new Error(`no scenarios for ${p.market}/${p.vertical}`);
          return out(await runEval(p.assistantId, scenarios));
        }

        case "audio_forensics": {
          const p = z.object({ callId: z.string() }).parse(args);
          return out(await audioForensics(p.callId));
        }

        case "prompt_diff": {
          const p = z
            .object({
              action: z.enum(["snapshot", "diff", "rollback"]),
              assistantId: z.string(),
              fromVersion: z.string().optional(),
              toVersion: z.string().optional(),
            })
            .parse(args);
          if (p.action === "snapshot") return out(await promptSnapshot(p.assistantId));
          if (p.action === "diff") {
            if (!p.fromVersion || !p.toVersion) throw new Error("fromVersion and toVersion required for diff");
            return out(promptDiff(p.assistantId, p.fromVersion, p.toVersion));
          }
          if (p.action === "rollback") {
            if (!p.toVersion) throw new Error("toVersion required for rollback");
            return out(await promptRollback(p.assistantId, p.toVersion));
          }
          throw new Error("unknown action");
        }

        case "regression_gate": {
          const p = z
            .object({
              assistantId: z.string(),
              market: z.enum(["fr", "us", "sv"]),
              vertical: z.string(),
              baselineScore: z.number(),
            })
            .parse(args);
          const scenarios = evalScenarios[p.market]?.[p.vertical];
          if (!scenarios) throw new Error(`no scenarios for ${p.market}/${p.vertical}`);
          const report = await runEval(p.assistantId, scenarios);
          const allowed = report.grade >= p.baselineScore;
          return out({
            allowed,
            currentScore: report.grade,
            baselineScore: p.baselineScore,
            verdict: report.verdict,
            reason: allowed
              ? `Score ${report.grade} >= baseline ${p.baselineScore}`
              : `Score ${report.grade} < baseline ${p.baselineScore} — update blocked`,
          });
        }

        default:
          throw new Error(`unknown tool: ${name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}
