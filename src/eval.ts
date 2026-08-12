/**
 * run_eval — the agent tests itself.
 * Fetches the assistant's system prompt from Vapi, simulates N scripted scenarios
 * against the configured LLM (OpenAI-compatible), scores behavior, returns a /100 report.
 * No Vapi billing needed — we test the prompt itself.
 */
import { vapiGet } from "./vapi.js";

// ─── LLM client (OpenAI-compatible) ─────────────────────────────────────────

let llmConfig: { apiKey: string; baseURL: string } | null = null;

export function setLLM(cfg: { apiKey: string; baseURL?: string }) {
  llmConfig = { apiKey: cfg.apiKey, baseURL: cfg.baseURL ?? "https://api.openai.com/v1" };
}

export type LlmConfig = { apiKey: string; baseURL: string };

async function llmChat(
  messages: { role: string; content: string }[],
  model: string,
  temperature = 0.6,
  maxTokens = 200,
  llmOverride?: LlmConfig
): Promise<string> {
  const cfg = llmOverride ?? llmConfig;
  if (!cfg) throw new Error("LLM not configured (setLLM)");
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvalScenario {
  id: string;
  label: string;
  turns: string[];
  checks: EvalCheck[];
  /**
   * Caller number injected into {{customer.number}} for this scenario.
   * Default: EVAL_CALLER_NUMBER env or "+33612345678". Set to false to
   * simulate a hidden/absent caller number (tests the "no number visible" branch).
   */
  callerNumber?: string | false;
}

export interface EvalCheck {
  label: string;
  mustContain?: string[];
  mustNotContain?: string[];
  anyOf?: string[];
  /** patterns interdits UNIQUEMENT dans la dernière réponse de l'agent (ex: ne pas répéter un chiffre après correction) */
  lastTurnMustNotContain?: string[];
  weight: number;
}

export interface TurnLog {
  user: string;
  assistant: string;
}

export interface ScenarioResult {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  passed: { check: string; ok: boolean }[];
  turns: TurnLog[];
}

export interface EvalReport {
  assistantId: string;
  assistantVersion?: string;
  model?: string;
  runAt: string;
  totalScore: number;
  maxScore: number;
  grade: number;
  scenarios: ScenarioResult[];
  verdict: "PASS" | "WARN" | "FAIL";
  /** Hard-check failures (phone fidelity, template leak). Any entry forces verdict = FAIL. */
  hardFailures: { scenario: string; check: string; detail: string }[];
}

// ─── Global hard checks ─────────────────────────────────────────────────────
// These run on EVERY scenario of EVERY market. They test reliability, not
// script compliance: a hallucinated phone number is a dead lead even when the
// conversation "followed the script".

const DIGIT_WORDS: Record<string, string> = {
  "zéro": "0", zero: "0", cero: "0", oh: "0", o: "0",
  un: "1", une: "1", one: "1", uno: "1", una: "1",
  deux: "2", two: "2", dos: "2",
  trois: "3", three: "3", tres: "3",
  quatre: "4", four: "4", cuatro: "4",
  cinq: "5", five: "5", cinco: "5",
  six: "6", seis: "6",
  sept: "7", seven: "7", siete: "7",
  huit: "8", eight: "8", ocho: "8",
  neuf: "9", nine: "9", nueve: "9",
};

/** Extract phone-length numbers (>= 6 digits) from text: plain digits AND spelled-out digits (fr/en/es). */
export function extractNumbers(text: string): string[] {
  const found: string[] = [];
  // 1) plain digit sequences: "06 75 44 15 74", "+33 6 12 34 56 78"
  for (const m of text.matchAll(/\+?\d(?:[\d\s.\-()]|\d){5,}/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 6) found.push(digits);
  }
  // 2) spelled-out runs, including French compound numbers:
  //    "zéro six soixante-quinze quarante-quatre quinze soixante-quatorze" → 0675441574
  const tokens = text.toLowerCase().split(/[^a-zàâäéèêëîïôöùûüç]+/i).filter(Boolean);
  let run = "";
  const flush = () => {
    if (run.length >= 6) found.push(run);
    run = "";
  };
  let i = 0;
  while (i < tokens.length) {
    const [val, consumed] = parseFrNumber(tokens, i);
    if (val !== null) {
      run += String(val);
      i += consumed;
    } else if (DIGIT_WORDS[tokens[i]] !== undefined) {
      run += DIGIT_WORDS[tokens[i]];
      i++;
    } else {
      flush();
      i++;
    }
  }
  flush();
  return found;
}

// ─── French number parser (0–99, phone dictation style) ────────────────────

const FR_UN: Record<string, number> = {
  "zéro": 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const FR_TENS: Record<string, number> = {
  vingt: 20, trente: 30, quarante: 40, cinquante: 50,
};

/** Parse the remainder after a tens base: "et onze", "et un", "dix(-huit)", or a plain unit. Returns [value, consumed] from index i. */
function parseFrRemainder(tokens: string[], i: number): [number, number] {
  if (tokens[i] === "et" && tokens[i + 1] === "onze") return [11, 2];
  if (tokens[i] === "et" && (tokens[i + 1] === "un" || tokens[i + 1] === "une")) return [1, 2];
  if (tokens[i] === "dix") {
    const u = FR_UN[tokens[i + 1]];
    if (u !== undefined && u >= 1 && u <= 9) return [10 + u, 2]; // dix-huit = 18
    return [10, 1];
  }
  const u = FR_UN[tokens[i]];
  if (u !== undefined && u > 0) return [u, 1];
  return [0, 0];
}

/** Parse a French number (0-99) starting at tokens[i]. Returns [value, tokensConsumed] or [null, 0]. */
function parseFrNumber(tokens: string[], i: number): [number | null, number] {
  const t = tokens[i];
  if (t === undefined) return [null, 0];

  // quatre-vingt(-…) → 80-99 : "quatre vingt quinze" = 95, "quatre vingt dix huit" = 98
  if (t === "quatre" && tokens[i + 1] === "vingt") {
    const [r, n] = parseFrRemainder(tokens, i + 2);
    return [80 + r, 2 + n];
  }
  // soixante(-…) → 60-79 : "soixante quinze" = 75, "soixante dix huit" = 78, "soixante et onze" = 71
  if (t === "soixante") {
    const [r, n] = parseFrRemainder(tokens, i + 1);
    return [60 + r, 1 + n];
  }
  // dix-sept / dix-huit / dix-neuf
  if (t === "dix") {
    const u = FR_UN[tokens[i + 1]];
    if (u !== undefined && u >= 7 && u <= 9) return [10 + u, 2];
    return [10, 1];
  }
  // vingt / trente / quarante / cinquante (+ et un)
  if (FR_TENS[t] !== undefined) {
    const [r, n] = parseFrRemainder(tokens, i + 1);
    return [FR_TENS[t] + r, 1 + n];
  }
  if (FR_UN[t] !== undefined) return [FR_UN[t], 1];
  return [null, 0];
}

function numbersEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // tolerate country-code prefix differences (+33 6… vs 06…)
  const variants = (n: string): string[] => {
    const v = [n];
    if (n.startsWith("33")) v.push("0" + n.slice(2));
    if (n.startsWith("0")) v.push("33" + n.slice(1));
    return v;
  };
  for (const x of variants(a))
    for (const y of variants(b)) {
      if (x === y) return true;
      const [long, short] = x.length >= y.length ? [x, y] : [y, x];
      if (short.length >= 6 && long.endsWith(short)) return true;
    }
  return false;
}

interface HardFailure { scenario: string; check: string; detail: string }

function runHardChecks(scenarioLabel: string, turns: TurnLog[], knownNumbers: string[]): HardFailure[] {
  const failures: HardFailure[] = [];

  // Hard check 1 — no template/prompt leak: [ ] never belong in speech
  for (const t of turns) {
    if (/[\[\]]/.test(t.assistant)) {
      failures.push({
        scenario: scenarioLabel,
        check: "anti-leak",
        detail: `template brackets spoken aloud: "${t.assistant.slice(0, 120)}…"`,
      });
      break;
    }
  }

  // Hard check 2 — phone fidelity: every number the agent says must come from
  // the caller (user turns) or the injected caller ID (knownNumbers)
  const userNumbers = [...turns.flatMap((t) => extractNumbers(t.user)), ...knownNumbers];
  for (const t of turns) {
    for (const num of extractNumbers(t.assistant)) {
      if (!userNumbers.some((u) => numbersEqual(u, num))) {
        failures.push({
          scenario: scenarioLabel,
          check: "phone-fidelity",
          detail: userNumbers.length
            ? `agent said ${num} but available numbers were ${userNumbers.join(", ")}`
            : `agent invented ${num} — caller never gave a number`,
        });
      }
    }
  }
  return failures;
}

/** Soft global check: at most 2 questions per agent turn. */
const MAX_QUESTIONS_PER_TURN = 2;
const QUESTIONS_WEIGHT = 10;

// ─── Runner ─────────────────────────────────────────────────────────────────

export interface RunEvalOpts {
  /** Per-request Vapi token (Smithery). Falls back to module global. */
  vapiToken?: string;
  /** Per-request LLM config. Falls back to module global from setLLM. */
  llm?: { apiKey: string; baseURL?: string };
}

export async function runEval(
  assistantId: string,
  scenarios: EvalScenario[],
  opts?: RunEvalOpts
): Promise<EvalReport> {
  const llm: LlmConfig | undefined = opts?.llm
    ? { apiKey: opts.llm.apiKey, baseURL: opts.llm.baseURL ?? "https://api.openai.com/v1" }
    : undefined;

  // Fetch the assistant's live prompt + model from Vapi
  const assistant = await vapiGet(`/assistant/${assistantId}`, opts?.vapiToken);
  const systemPrompt: string = assistant.model?.messages?.[0]?.content ?? "";
  const model: string = assistant.model?.model ?? "gpt-4.1";
  const temperature: number = assistant.model?.temperature ?? 0.6;
  const maxTokens: number = assistant.model?.maxTokens ?? 200;
  const version: string = assistant.latestVersion ?? assistant.version ?? "unknown";

  if (!systemPrompt) throw new Error("assistant has no system prompt");

  const results: ScenarioResult[] = [];
  const hardFailures: HardFailure[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const sc of scenarios) {
    // Substitute Vapi template variables like a real call would — otherwise the
    // agent sees a raw {{customer.number}} and hallucinates a number to fill it.
    const callerNumber =
      sc.callerNumber === false
        ? null
        : sc.callerNumber ?? process.env.EVAL_CALLER_NUMBER ?? "+33612345678";
    const scenarioPrompt = systemPrompt
      .replaceAll("{{date}}", new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))
      .replaceAll("{{customer.number}}", callerNumber ?? "non disponible (numéro masqué)");
    const knownNumbers = callerNumber ? extractNumbers(callerNumber) : [];

    const messages: { role: string; content: string }[] = [
      { role: "system", content: scenarioPrompt },
    ];
    const turns: TurnLog[] = [];
    let assistantText = "";

    for (const userMsg of sc.turns) {
      messages.push({ role: "user", content: userMsg });
      const response = await llmChat(messages, model, temperature, maxTokens, llm);
      messages.push({ role: "assistant", content: response });
      turns.push({ user: userMsg, assistant: response });
      assistantText += "\n" + response;
    }

    const lower = assistantText.toLowerCase();
    const lastTurn = turns.at(-1)?.assistant.toLowerCase() ?? "";
    const passed: { check: string; ok: boolean }[] = [];
    let scScore = 0;
    let scMax = 0;

    for (const chk of sc.checks) {
      scMax += chk.weight;
      let ok = true;
      if (chk.mustContain) {
        ok = chk.mustContain.every((pat) => new RegExp(pat, "i").test(lower));
      }
      if (ok && chk.mustNotContain) {
        ok = !chk.mustNotContain.some((pat) => new RegExp(pat, "i").test(lower));
      }
      if (ok && chk.anyOf) {
        ok = chk.anyOf.some((pat) => new RegExp(pat, "i").test(lower));
      }
      if (ok && chk.lastTurnMustNotContain) {
        ok = !chk.lastTurnMustNotContain.some((pat) => new RegExp(pat, "i").test(lastTurn));
      }
      if (ok) scScore += chk.weight;
      passed.push({ check: chk.label, ok });
    }

    // Global soft check: question density per turn
    scMax += QUESTIONS_WEIGHT;
    const maxQ = Math.max(
      0,
      ...turns.map((t) => (t.assistant.match(/\?/g) ?? []).length)
    );
    const qOk = maxQ <= MAX_QUESTIONS_PER_TURN;
    if (qOk) scScore += QUESTIONS_WEIGHT;
    passed.push({ check: `≤ ${MAX_QUESTIONS_PER_TURN} questions per turn (max seen: ${maxQ})`, ok: qOk });

    // Global hard checks: any failure forces the whole report to FAIL
    const hard = runHardChecks(sc.label, turns, knownNumbers);
    hardFailures.push(...hard);
    passed.push(
      { check: "HARD: no template leak", ok: !hard.some((h) => h.check === "anti-leak") },
      { check: "HARD: phone fidelity", ok: !hard.some((h) => h.check === "phone-fidelity") }
    );

    results.push({ id: sc.id, label: sc.label, score: scScore, maxScore: scMax, passed, turns });
    totalScore += scScore;
    maxScore += scMax;
  }

  const grade = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const verdict =
    hardFailures.length > 0 ? "FAIL" : grade >= 80 ? "PASS" : grade >= 55 ? "WARN" : "FAIL";

  return {
    assistantId,
    assistantVersion: version,
    model,
    runAt: new Date().toISOString(),
    totalScore,
    maxScore,
    grade,
    scenarios: results,
    verdict,
    hardFailures,
  };
}
