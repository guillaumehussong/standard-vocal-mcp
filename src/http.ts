#!/usr/bin/env node
/**
 * Standard Vocal MCP — hosted Streamable HTTP entry.
 * Lets anyone plug the factory into Claude (or any MCP client) with just a URL.
 *
 * Env:
 *   VAPI_TOKEN / VAPI_API_KEY  (required) — server-side Vapi account (private route)
 *   OPENAI_API_KEY             (required for run_eval / regression_gate on private route)
 *   MCP_ACCESS_TOKEN           (required) — URL path token: /mcp/<token>
 *   PORT                       (default 6275)
 *
 * Routes:
 *   /mcp/:token  — private demo (server env keys)
 *   /mcp         — public Smithery (per-request config; no silent env fallback)
 *
 * Stateless: one server+transport per request, no session persistence.
 *
 * Smithery config transport (docs/build/session-config):
 *   - Query params and/or HTTP headers forwarded by the gateway
 *   - Secrets preferred via headers (x-from: { header: "..." })
 *   - Also accepts ?config=<base64url JSON> for robustness
 */
import express from "express";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bootstrapEnv, createServer, type ServerConfig } from "./server.js";
import { extractRequestConfig } from "./request-config.js";

const PORT = Number(process.env.PORT || 6275);
const ACCESS_TOKEN = process.env.MCP_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error("Missing MCP_ACCESS_TOKEN env var");
  process.exit(1);
}

bootstrapEnv();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "standard-vocal-mcp", transport: "streamable-http" });
});

function jsonRpcError(res: Response, message: string, status = 400) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

async function handleMcp(req: Request, res: Response, config?: ServerConfig) {
  const server = createServer(config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal error" });
    }
  }
}

// Public Smithery endpoint — per-request keys only (no silent env fallback).
app.all("/mcp", async (req, res) => {
  const cfg = extractRequestConfig(req);
  if (!cfg.vapiToken) {
    jsonRpcError(res, "VAPI_TOKEN required (add it in the connector configuration)");
    return;
  }
  await handleMcp(req, res, cfg);
});

// Private demo endpoint — token in the path; uses server env keys via globals.
app.all("/mcp/:token", async (req, res) => {
  if (req.params.token !== ACCESS_TOKEN) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await handleMcp(req, res);
});

app.listen(PORT, "127.0.0.1", () => {
  console.error(
    `standard-vocal-mcp HTTP listening on 127.0.0.1:${PORT} (/mcp Smithery, /mcp/<token> private)`
  );
});
