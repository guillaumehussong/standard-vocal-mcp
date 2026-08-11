# standard-vocal-mcp

> A **Voice Agent Factory** exposed over the Model Context Protocol. Not a CRUD wrapper — a factory that deploys production phone agents, tests them, audits their audio, and gates their prompts like code.

Built on top of [Vapi](https://vapi.ai) (telephony + LLM + STT + TTS). Differs from the official `vapi-mcp-server`, which is a generic CRUD wrapper over the Vapi API. This is the **factory layer**: vertical templates, self-testing agents, audio forensics, prompt versioning, CI regression gates.

## Why it's hard to copy

The official Vapi MCP is 20 tools that each map to one raw API call. Anyone can read the docs and rebuild it in an hour.

This one encodes months of empirical tuning into its templates — transcriber parameters (`numerals`, `confidenceThreshold`, `keywords`, endpointing), voice selection, conversation flow, urgency handling — plus evaluation logic and audio diagnostics that require knowing the Vapi artifacts API and audio signal processing. The longer it runs, the more reference data it accumulates. That's the moat.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | Lists the assistants on the account (id, name, model, voice, transcriber) — the entry point to find an `assistantId`. |
| `deploy_agent` | One tool = one full vertical deployment. `deploy_agent(vertical: elagueur\|plombier, company, extraKeywords)` creates a complete Vapi assistant: prompt, voice, transcriber, keywords, greeting. |
| `run_eval` | **The agent tests itself.** Fetches the live system prompt, simulates N scripted scenarios against the configured LLM, scores behavior (close speed, no price quoting, spelled digit confirmation, urgency priority, solicitation refusal), returns a `/100` grade with PASS / WARN / FAIL. No audio, no billing — pure prompt evaluation. **Global hard checks on every scenario**: phone fidelity (any number the agent speaks must be one the caller gave — catches hallucinated numbers that plain "did it spell the digits?" checks miss) and anti-leak (template brackets never reach the caller's ear). One hard failure = verdict FAIL, whatever the grade. |
| `audio_forensics` | Downloads the 3 recording tracks of a call (mono / customer / assistant), runs RMS-per-window analysis, and **locates the noise source**. Automates the exact manual investigation that found a "computer noise" issue was injected downstream of the caller's mic, not in Vapi. |
| `prompt_diff` | Prompts as code. `snapshot` captures the live prompt into local history, `diff` compares two versions, `rollback` pushes an old prompt back to Vapi. |
| `regression_gate` | **CI for prompts.** Runs `run_eval` and blocks the update if the score regressed vs the stored baseline. Returns allow/deny with the reason. |

## Quickstart

```bash
# Claude Code
claude mcp add standard-vocal -- npx -y standard-vocal-mcp

# Env
export VAPI_TOKEN="your_vapi_token"
export OPENAI_API_KEY="your_openai_key"   # used by run_eval to simulate scenarios
```

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "standard-vocal": {
      "command": "npx",
      "args": ["-y", "standard-vocal-mcp"],
      "env": {
        "VAPI_TOKEN": "<token>",
        "OPENAI_API_KEY": "<key>"
      }
    }
  }
}
```

Prompt snapshots (`prompt_diff`) are stored in `./.standard-vocal/` of the directory you launch from — override with `STANDARD_VOCAL_STATE_DIR`.

## Example: one call = one working agent

```
deploy_agent({ vertical: "elagueur", company: "L'Arbre en Nord", extraKeywords: ["Coutiches", "Ramoniers"] })
```

→ creates the assistant with:
- A receptionist prompt tuned for tree service (close after 3 questions, spelled-digit confirmation, urgency priority, never quote a price)
- The right French voice (ElevenLabs)
- Deepgram `nova-3` with `numerals: true`, `confidenceThreshold: 0.5`, and keywords boosted for the business's real streets/towns

Then:

```
run_eval({ assistantId: "...", vertical: "elagueur" })
```

→ runs 4 scripted scenarios (standard quote, address correction, storm emergency, solicitation) and returns a `/100` grade with per-check pass/fail.

## Eval report example

```
GRADE: 100/100  →  PASS

[100/100] Devis classique (close rapide)
   ✓ Demande le type de chantier
   ✓ Demande l'adresse ou la ville
   ✓ Confirme le numéro de rue en épelant les chiffres
   ✓ Ne donne jamais de prix
   ✓ Clôture avec promesse de rappel
```

## Architecture

```
Claude / any MCP client
        │  (stdio)
        ▼
standard-vocal-mcp  ──┬──► Vapi API (assistants, calls, recordings)
  (5 factory tools)   ├──► OpenAI-compatible LLM (eval simulation)
                      └──► Vapi artifacts API (mono/customer/assistant WAV)
```

- `src/deploy.ts` — vertical deployment
- `src/eval.ts` — self-testing engine
- `src/forensics.ts` — audio analysis
- `src/versioning.ts` — prompt history / diff / rollback
- `verticals/templates.json` — vertical templates (prompt, voice, transcriber, keywords)
- `evals/scenarios.json` — scripted eval scenarios with weighted checks

## Roadmap

- [ ] More verticals (dentiste, kiné, restaurant, garage)
- [ ] `regression_gate` integration with CI (GitHub Action)
- [ ] Call-level latency breakdown in `audio_forensics`
- [ ] Hosted `mcp-remote` variant (like Vapi's `mcp.vapi.ai`)
- [ ] Scenario auto-generation from real call transcripts

---

*Built by Guillaume Jean Hussong · Standard Vocal — the phone agent factory.*
