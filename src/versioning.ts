/**
 * prompt_diff — local versioning of assistant prompts (history + diff + rollback).
 * Prompts are code; track them like code.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { vapiGet, vapiPatch } from "./vapi.js";

// Snapshots live in the caller's project (or STANDARD_VOCAL_STATE_DIR),
// never inside the installed package — npx caches are shared and ephemeral.
const STORE_DIR =
  process.env.STANDARD_VOCAL_STATE_DIR ?? join(process.cwd(), ".standard-vocal");
const STORE = join(STORE_DIR, "prompt-history.json");

interface HistoryEntry {
  assistantId: string;
  version: string;
  prompt: string;
  changedAt: string;
}

function load(): HistoryEntry[] {
  if (!existsSync(STORE)) return [];
  return JSON.parse(readFileSync(STORE, "utf8"));
}

function save(entries: HistoryEntry[]) {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE, JSON.stringify(entries, null, 2));
}

/** Snapshot current prompt from Vapi into local history (call on fetch or after update). */
export async function promptSnapshot(assistantId: string): Promise<{ version: string; prompt: string }> {
  const a = await vapiGet(`/assistant/${assistantId}`);
  const prompt = a.model?.messages?.[0]?.content ?? "";
  const version = a.latestVersion ?? a.version ?? "unknown";
  const entries = load();
  const last = entries.filter((e) => e.assistantId === assistantId).at(-1);
  if (!last || last.prompt !== prompt) {
    entries.push({ assistantId, version, prompt, changedAt: new Date().toISOString() });
    save(entries);
  }
  return { version, prompt };
}

/** Diff two versions of the same assistant's prompt. */
export function promptDiff(assistantId: string, fromVersion: string, toVersion: string) {
  const entries = load().filter((e) => e.assistantId === assistantId);
  const a = entries.find((e) => e.version === fromVersion);
  const b = entries.find((e) => e.version === toVersion);
  if (!a || !b) throw new Error("version not found in local history");
  return diffText(a.prompt, b.prompt, fromVersion, toVersion);
}

/** Rollback: push an old prompt back to Vapi. */
export async function promptRollback(assistantId: string, toVersion: string) {
  const entries = load().filter((e) => e.assistantId === assistantId);
  const target = entries.find((e) => e.version === toVersion);
  if (!target) throw new Error("version not found in local history");
  await vapiPatch(`/assistant/${assistantId}`, {
    model: {
      provider: "openai",
      model: "gpt-4.1",
      temperature: 0.6,
      maxTokens: 200,
      messages: [{ role: "system", content: target.prompt }],
    },
  });
  return { rolledBackTo: toVersion };
}

function diffText(a: string, b: string, va: string, vb: string) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const added: string[] = [];
  const removed: string[] = [];
  const setA = new Set(la);
  const setB = new Set(lb);
  for (const l of lb) if (!setA.has(l)) added.push(l);
  for (const l of la) if (!setB.has(l)) removed.push(l);
  return { from: va, to: vb, added, removed };
}
