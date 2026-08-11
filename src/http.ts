#!/usr/bin/env node
/**
 * Standard Vocal MCP — hosted Streamable HTTP entry.
 * Lets anyone plug the factory into Claude (or any MCP client) with just a URL.
 *
 * Env:
 *   VAPI_TOKEN / VAPI_API_KEY  (required) — server-side Vapi account
 *   OPENAI_API_KEY             (required for run_eval / regression_gate)
 *   MCP_ACCESS_TOKEN           (required) — URL path token: /mcp/<token>
 *   PORT                       (default 6275)
 *
 * Stateless: one server+transport per request, no session persistence.
 */
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bootstrapEnv, createServer } from "./server.js";

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

// Stateless MCP endpoint — token in the path is the only auth.
app.all("/mcp/:token", async (req, res) => {
  if (req.params.token !== ACCESS_TOKEN) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const server = createServer();
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
});

app.listen(PORT, "127.0.0.1", () => {
  console.error(`standard-vocal-mcp HTTP listening on 127.0.0.1:${PORT} (/mcp/<token>)`);
});
