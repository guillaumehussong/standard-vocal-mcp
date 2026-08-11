/**
 * Vapi API client — thin wrapper with auth + UA (Cloudflare blocks default undici UA).
 */
const VAPI_BASE = "https://api.vapi.ai";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let token: string | null = null;

export function setVapiToken(t: string) {
  token = t;
}

function headers() {
  if (!token) throw new Error("VAPI_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": UA,
  };
}

export async function vapiGet(path: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`Vapi GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function vapiPost(path: string, body: unknown) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vapi POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function vapiPatch(path: string, body: unknown) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vapi PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function vapiDelete(path: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error(`Vapi DELETE ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function vapiDownload(path: string): Promise<Buffer> {
  const res = await fetch(`${VAPI_BASE}${path}`, { headers: headers(), redirect: "follow" });
  if (!res.ok) throw new Error(`Vapi download ${path} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Chat (non-streaming) — used by run_eval to test conversation without audio. */
export async function vapiChat(
  input: string,
  opts: { assistantId?: string; assistantOverride?: unknown; previousChatId?: string }
): Promise<{ chatId: string; response: string; messages: { role: string; content: string }[] }> {
  const res = await vapiPost("/chat", {
    ...(opts.assistantId ? { assistantId: opts.assistantId } : {}),
    ...(opts.assistantOverride ? { assistant: opts.assistantOverride } : {}),
    ...(opts.previousChatId ? { previousChatId: opts.previousChatId } : {}),
    input,
  });
  const output = res.output?.[0]?.content ?? res.output ?? "";
  return {
    chatId: res.id,
    response: typeof output === "string" ? output : JSON.stringify(output),
    messages: res.messages ?? [],
  };
}
