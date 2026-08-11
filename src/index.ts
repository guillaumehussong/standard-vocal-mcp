#!/usr/bin/env node
/**
 * Standard Vocal MCP — Voice Agent Factory (stdio entry, npm package).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrapEnv, createServer } from "./server.js";

async function main() {
  bootstrapEnv();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("standard-vocal-mcp server running on stdio");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
