/**
 * test-validate — static validation of the factory data (no network, no secrets).
 * Checks that every market/vertical template has matching eval scenarios and valid checks.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const templates = JSON.parse(readFileSync(join(root, "verticals", "templates.json"), "utf8"));
const scenarios = JSON.parse(readFileSync(join(root, "evals", "scenarios.json"), "utf8"));

const failures: string[] = [];
let checks = 0;

for (const [mid, market] of Object.entries<any>(templates)) {
  if (!["fr", "us", "sv"].includes(mid)) failures.push(`${mid}: market id invalide`);
  if (!market.locale) failures.push(`${mid}: locale manquante`);
  if (!market.voice?.voiceId) failures.push(`${mid}: voice manquante`);
  for (const [tid, tpl] of Object.entries<any>(market.verticals)) {
    if (!tpl.name) failures.push(`${mid}/${tid}: name manquant`);
    if (!tpl.greeting) failures.push(`${mid}/${tid}: greeting manquant`);
    if (!tpl.promptTemplate) failures.push(`${mid}/${tid}: prompt manquant`);
    const sc = scenarios[mid]?.[tid];
    if (!sc || sc.length === 0) {
      failures.push(`${mid}/${tid}: aucun scénario d'éval`);
    } else {
      for (const s of sc) {
        if (!s.turns || s.turns.length === 0) failures.push(`${mid}/${tid}: scénario sans turns`);
        let weight = 0;
        for (const c of s.checks ?? []) {
          checks++;
          weight += c.weight ?? 0;
          if (!c.label) failures.push(`${mid}/${tid}: check sans label`);
          const hasAny = c.mustContain || c.mustNotContain || c.anyOf || c.lastTurnMustNotContain;
          if (!hasAny) failures.push(`${mid}/${tid}: check "${c.label}" sans condition`);
        }
        if (weight !== 100) failures.push(`${mid}/${tid}: poids des checks = ${weight} (attendu 100 par scénario)`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} problème(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS — ${Object.keys(templates).length} marchés, ${checks} checks validés, tous les templates ont leurs scénarios.`);
