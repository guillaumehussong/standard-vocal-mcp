/**
 * Standard Vocal — web app for non-technical clients, multi-market.
 * Markets: fr / us / sv. Pick your country → trade → company → create → test → get called.
 */
import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { setVapiToken, vapiPost } from "./vapi.js";
import { setLLM } from "./eval.js";
import { deployAgent, marketList } from "./deploy.js";
import { runEval } from "./eval.js";
import { audioForensics } from "./forensics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

const evalScenarios = JSON.parse(
  readFileSync(join(__dirname, "..", "evals", "scenarios.json"), "utf8")
);
const markets = JSON.parse(
  readFileSync(join(__dirname, "..", "verticals", "templates.json"), "utf8")
);

// ─── Env setup ───────────────────────────────────────────────────────────────

const VAPI_TOKEN = process.env.VAPI_TOKEN || process.env.VAPI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!VAPI_TOKEN) {
  console.error("Missing VAPI_TOKEN env var");
  process.exit(1);
}
setVapiToken(VAPI_TOKEN);
if (OPENAI_KEY) setLLM({ apiKey: OPENAI_KEY, baseURL: "https://api.openai.com/v1" });

// ─── API ─────────────────────────────────────────────────────────────────────

app.get("/api/verticals", (_req, res) => {
  res.json(marketList());
});

app.post("/api/deploy", async (req, res) => {
  try {
    const { market, vertical, company, extraKeywords } = req.body;
    if (!market || !vertical || !company) {
      return res.status(400).json({ error: "market, vertical and company are required" });
    }
    const result = await deployAgent({ market, vertical, company, extraKeywords });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/eval", async (req, res) => {
  try {
    const { assistantId, market, vertical } = req.body;
    if (!assistantId || !market || !vertical) {
      return res.status(400).json({ error: "assistantId, market and vertical are required" });
    }
    const scenarios = evalScenarios[market]?.[vertical];
    if (!scenarios) {
      return res.status(400).json({ error: `no scenarios for ${market}/${vertical}` });
    }
    const report = await runEval(assistantId, scenarios);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/forensics", async (req, res) => {
  try {
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ error: "callId is required" });
    res.json(await audioForensics(callId));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/gate", async (req, res) => {
  try {
    const { assistantId, market, vertical, baselineScore } = req.body;
    if (!assistantId || !market || !vertical || baselineScore === undefined) {
      return res.status(400).json({ error: "assistantId, market, vertical and baselineScore are required" });
    }
    const scenarios = evalScenarios[market]?.[vertical];
    if (!scenarios) return res.status(400).json({ error: `no scenarios for ${market}/${vertical}` });
    const report = await runEval(assistantId, scenarios);
    const allowed = report.grade >= baselineScore;
    res.json({
      allowed,
      currentScore: report.grade,
      baselineScore,
      verdict: report.verdict,
      reason: allowed
        ? `Score ${report.grade} >= baseline ${baselineScore}`
        : `Score ${report.grade} < baseline ${baselineScore} — update blocked`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── Outbound call : l'agent appelle le client pour de vrai ──────────────────

app.post("/api/call-me", async (req, res) => {
  try {
    const { assistantId, phoneNumber, market } = req.body;
    if (!assistantId || !phoneNumber || !market) {
      return res.status(400).json({ error: "assistantId, phoneNumber and market are required" });
    }
    const m = markets[market];
    if (!m) return res.status(400).json({ error: `unknown market: ${market}` });
    if (!m.phoneNumberId) {
      return res.status(400).json({ error: `No Twilio number configured for market ${market}. Buy one in the Vapi dashboard.` });
    }

    let num = String(phoneNumber).replace(/[\s.-]/g, "");
    // Normalisation locale par marché (formats familiers)
    if (market === "fr" && num.startsWith("0") && num.length === 10) num = "+33" + num.slice(1);
    else if (market === "us" && num.length === 10 && /^\d{10}$/.test(num)) num = "+1" + num;
    else if (market === "sv" && num.length === 8 && /^\d{8}$/.test(num)) num = "+503" + num;

    // Validation : n'importe quel numéro international E.164 valide est accepté
    // (le numéro du marché appelle le destinataire, où qu'il soit).
    if (!/^\+[1-9]\d{7,14}$/.test(num)) {
      return res.status(400).json({ error: `Invalid number (e.g. ${markets[market]?.phoneExample || "4155550132"} or +50370902843)` });
    }

    const call = await vapiPost("/call", {
      phoneNumberId: m.phoneNumberId,
      customer: { number: num },
      assistantId,
    });
    res.json({ callId: call.id, status: call.status, to: num });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── Voice preview (TTS du greeting, zéro dépendance externe) ────────────────

app.post("/api/preview", async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    if (!text || !voiceId) return res.status(400).json({ error: "text and voiceId are required" });
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY is missing" });
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
      }),
    });
    if (!r.ok) return res.status(500).json({ error: `ElevenLabs ${r.status}` });
    const audio = Buffer.from(await r.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const PORT = Number(process.env.PORT || 6274);
app.listen(PORT, () => {
  console.log(`Standard Vocal app → http://localhost:${PORT}`);
});
