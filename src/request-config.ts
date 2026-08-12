/**
 * Per-request Smithery / connector config extraction.
 * See https://smithery.ai/docs/build/session-config
 *
 * Transport (URL-published upstream):
 *   - Query params and/or HTTP headers (gateway passthrough)
 *   - Secrets preferred as headers via x-from: { header: "..." }
 *   - Also accepts ?config=<base64url JSON> for robustness
 */
import type { Request } from "express";
import type { ServerConfig } from "./server.js";

const VAPI_KEYS = ["VAPI_TOKEN", "VAPI_API_KEY", "vapiToken", "vapiApiKey", "vapi_token", "vapi_api_key"];
const OPENAI_KEYS = ["OPENAI_API_KEY", "openaiApiKey", "openaiKey", "openai_api_key", "openai_key"];
const VAPI_HEADERS = ["x-vapi-token", "x-vapi-api-key", "vapi-token", "vapi-api-key"];
const OPENAI_HEADERS = ["x-openai-api-key", "openai-api-key"];

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function headerValue(req: Request, names: string[]): string | undefined {
  for (const name of names) {
    const v = req.headers[name];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  }
  return undefined;
}

/** Decode ?config= (base64url or standard base64 JSON object). */
export function decodeConfigParam(raw: string): Record<string, unknown> {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + pad, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Extract per-request credentials from Smithery-forwarded query/headers.
 * Does NOT fall back to process.env — route handlers decide that policy.
 */
export function extractRequestConfig(req: Request): ServerConfig {
  const bag: Record<string, unknown> = {};

  const rawConfig = typeof req.query.config === "string" ? req.query.config : undefined;
  if (rawConfig) Object.assign(bag, decodeConfigParam(rawConfig));

  for (const [k, v] of Object.entries(req.query)) {
    if (k === "config") continue;
    if (typeof v === "string") bag[k] = v;
  }

  return {
    vapiToken: firstString(bag, VAPI_KEYS) || headerValue(req, VAPI_HEADERS),
    openaiKey: firstString(bag, OPENAI_KEYS) || headerValue(req, OPENAI_HEADERS),
  };
}
