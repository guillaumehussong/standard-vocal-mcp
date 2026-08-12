# PROMPT CURSOR — Sprint SMITHERY (standard-vocal-mcp)

Mode headless : zéro question, zéro attente. Tu exécutes tout, seul.

## Contexte

Repo : `/Users/guillaumehussong/Projects/standard-vocal-mcp` (branche `main`, propre, poussée).
MCP "Voice Agent Factory" publié sur npm (stdio) ET hébergé en HTTP pour une démo.

Aujourd'hui le serveur HTTP utilise des clés serveur (env). Objectif du sprint : le rendre compatible **Smithery** (smithery.ai), où CHAQUE utilisateur apporte ses propres clés, transmises par requête. Smithery proxifie notre serveur HTTPS et injecte la config utilisateur (query param `?config=` en base64 JSON, ou en-têtes selon la config schema déclarée).

**Lis d'abord ces deux pages de doc et applique-les :**
- https://smithery.ai/docs/build/publish
- https://smithery.ai/docs/build/session-config

## Ancres vérifiées (existant, ne pas halluciner)

- `src/http.ts` : entrée HTTP. Express, stateless, route `app.all("/mcp/:token", ...)`, env `MCP_ACCESS_TOKEN`, `PORT` (6275), `bootstrapEnv()` au démarrage, `createServer()` par requête.
- `src/server.ts` : factory `createServer()` + `bootstrapEnv()`. Contient TOOLS + handlers. Appelle `setVapiToken()` (de `src/vapi.ts`) et `setLLM()` (de `src/eval.ts`).
- `src/vapi.ts` : état global module (`setVapiToken`, `vapiGet`, `vapiPost`).
- `src/eval.ts` : `setLLM({apiKey, baseURL})` global.
- `src/index.ts` : entrée stdio npm. NE PAS changer son comportement.
- Tests : `npm test` = `node dist/test-validate.js` (130 checks). Build : `tsc`.

## Travail demandé

1. **Config par requête, concurrency-safe.** Les globales de `vapi.ts` / `eval.ts` cassent dès que 2 requêtes avec des clés différentes arrivent en même temps. Refactor : `createServer()` accepte une config optionnelle `{ vapiToken?, openaiKey? }`. Les handlers utilisent la config de LEUR requête (capture de closure / petit client instancié par requête), pas la globale. Les fonctions `vapiGet/vapiPost/runEval` reçoivent le token en paramètre (ou via un client). La globale reste comme fallback pour la route privée et le stdio.

2. **Lecture de la config Smithery.** Dans `src/http.ts`, extraire par requête : query param `config` (base64url JSON, champs `VAPI_TOKEN` et `OPENAI_API_KEY` — vérifie le format exact dans la doc session-config) ET/OU en-têtes dédiés si la doc les recommande. Prévoir aussi des noms de champs alternatifs courants (`vapiToken`, `openaiApiKey`) par robustesse.

3. **Route publique pour Smithery : `app.all("/mcp", ...)`.** Sans token dans le path. Exige des clés par requête : si ni config Smithery ni env serveur ne fournissent de `VAPI_TOKEN`, répondre une erreur JSON-RPC claire. Ne JAMAIS utiliser les clés env serveur comme fallback silencieux sur la route publique si l'utilisateur n'a rien fourni → dans ce cas précis, erreur explicite "VAPI_TOKEN required (add it in the connector configuration)".

4. **Route privée inchangée : `/mcp/:token`** continue d'utiliser les clés env serveur (comportement actuel, démo hébergée).

5. **stdio inchangé.**

## INTERDIT

- `npm publish`, `git push`, tout deploy VPS
- Modifier le contenu de `verticals/templates.json` ou `evals/scenarios.json`
- Casser la compat : le flux actuel (token + env) doit marcher pareil après le sprint
- Ajouter des dépendances lourdes (reste sur express + SDK MCP + zod)

## Done exige

1. `npm run build` vert
2. `npm test` vert (130 checks)
3. UN commit atomique sur `main`, sans push
4. Dans le résumé final : le format de config exact lu (champs, transport), et comment tu as vérifié la concurrence (2 clés différentes en parallèle)
