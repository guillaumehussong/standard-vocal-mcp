/**
 * deploy_agent — one tool, one full vertical deployment, any market.
 * Markets: fr (France), us (United States), sv (El Salvador).
 * Creates the Vapi assistant from a market+vertical template (prompt + voice + transcriber + keywords).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { vapiPost } from "./vapi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const markets = JSON.parse(
  readFileSync(join(__dirname, "..", "verticals", "templates.json"), "utf8")
);

export type MarketId = "fr" | "us" | "sv";

export interface DeployInput {
  market: MarketId;
  vertical: string;
  company: string;
  extraKeywords?: string[];
  voiceIdOverride?: string;
  name?: string;
}

export interface DeployOutput {
  assistantId: string;
  name: string;
  market: MarketId;
  vertical: string;
  company: string;
  greeting: string;
  keywords: string[];
  voiceId: string;
  locale: string;
}

export async function deployAgent(input: DeployInput): Promise<DeployOutput> {
  const market = markets[input.market];
  if (!market) throw new Error(`unknown market: ${input.market}. Available: ${Object.keys(markets).join(", ")}`);
  const tpl = market.verticals[input.vertical];
  if (!tpl) throw new Error(`unknown vertical: ${input.vertical} for market ${input.market}. Available: ${Object.keys(market.verticals).join(", ")}`);

  const name_ = market.receptionistName;
  const prompt = tpl.promptTemplate.replaceAll("{{company}}", input.company).replaceAll("{{name}}", name_);
  const greeting = tpl.greeting.replaceAll("{{company}}", input.company).replaceAll("{{name}}", name_);
  const endCall = market.endCallMessage;

  // Vapi constraints: name ≤ 40 chars; each keyword must be a single word ("word" or "word:number").
  // Split multi-word entries, strip apostrophes/spaces/dashes (accents are OK, dashes are NOT).
  const rawKeywords = [...(tpl.keywords || []), ...(input.extraKeywords || [])];
  const keywords = rawKeywords
    .flatMap((k) => k.split(/[\s'-]+/))
    .map((k) => k.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((k) => k.length > 0);
  const asstName = (input.name || `${name_} — ${input.company}`).slice(0, 40);

  const body = {
    name: asstName,
    firstMessage: greeting,
    endCallMessage: endCall,
    voice: {
      provider: market.voice.provider,
      voiceId: input.voiceIdOverride || market.voice.voiceId,
      model: market.voice.model,
    },
    model: {
      provider: tpl.model?.provider || "openai",
      model: tpl.model?.model || "gpt-4.1",
      temperature: tpl.model?.temperature ?? 0.6,
      maxTokens: tpl.model?.maxTokens ?? 200,
      messages: [{ role: "system", content: prompt }],
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: market.locale,
      endpointing: 200,
      numerals: true,
      confidenceThreshold: 0.5,
      keywords,
    },
  };

  let voiceId = input.voiceIdOverride || market.voice.voiceId;
  let created: any;
  try {
    created = await vapiPost("/assistant", body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Custom voices only exist on the org that owns them. On any other account
    // (demo/sandbox), retry once with a public premade 11labs voice (Rachel).
    if (!input.voiceIdOverride && /couldn't find .* voice/i.test(msg)) {
      voiceId = "21m00Tcm4TlvDq8ikWAM";
      (body.voice as { voiceId: string }).voiceId = voiceId;
      created = await vapiPost("/assistant", body);
    } else {
      throw e;
    }
  }
  return {
    assistantId: created.id,
    name: created.name,
    market: input.market,
    vertical: input.vertical,
    company: input.company,
    greeting,
    keywords,
    voiceId,
    locale: market.locale,
  };
}

/** Market metadata for the UI (flag, label, phone example, verticals). */
export function marketList() {
  return Object.entries(markets).map(([id, m]: [string, any]) => ({
    id,
    label: m.label,
    flag: m.flag,
    locale: m.locale,
    phoneExample: m.phoneExample,
    hasPhoneNumber: Boolean(m.phoneNumberId),
    verticals: Object.entries(m.verticals).map(([vid, v]: [string, any]) => ({
      id: vid,
      name: v.name,
      keywords: v.keywords,
    })),
  }));
}
