# Tester Standard Vocal MCP soi-même

*5 minutes. Aucune clé à taper. Le script fait tout.*

## Étape 1 — Lancer l'interface de test

Ouvre un terminal et tape :

```bash
cd /Users/guillaumehussong/Projects/standard-vocal-mcp
./test.sh
```

Le script :
1. récupère les clés tout seul (Vapi + OpenAI, depuis tes projets voisins)
2. recompile le code
3. lance l'interface de test
4. **ouvre ton navigateur tout seul** sur `http://localhost:6274`

La première fois, le téléchargement de l'interface prend ~30 secondes. C'est normal.

## Étape 2 — Connecter le serveur

Sur la page web :
1. Clique sur **« Connect »** (bouton en haut à gauche)
2. Tu dois voir un point vert ou un message de connexion

## Étape 3 — Voir les 5 tools

1. Clique sur l'onglet **« Tools »** (en haut)
2. Clique sur **« List Tools »**
3. Les 5 tools apparaissent : `deploy_agent`, `run_eval`, `audio_forensics`, `prompt_diff`, `regression_gate`

## Étape 4 — Tester chaque tool

Clique sur un tool, remplis les champs, clique sur **« Run Tool »**.

### 1. run_eval — l'agent se teste lui-même (le plus spectaculaire)

- `assistantId` : `c7e088ff-8fe9-417c-ab31-d8bb6bf4e96b`
- `vertical` : `elagueur`

**Résultat attendu** : `grade: 100`, `verdict: PASS`, les 4 scénarios à 100/100.

Le tool récupère le vrai prompt de Claire en prod, simule 4 conversations (devis, correction d'adresse, urgence tempête, démarchage), et note chaque comportement.

### 2. audio_forensics — l'enquête bruit automatisée

- `callId` : `019fe8c0-56cb-744e-b9db-f1c17855f194` (le vrai appel test de dimanche)

**Résultat attendu** : `verdict: noise_downstream_of_vapi`, customer floor à 0, interprétation qui explique que le bruit vient d'après Vapi.

### 3. prompt_diff — versionner le prompt

- `action` : `snapshot`
- `assistantId` : `c7e088ff-8fe9-417c-ab31-d8bb6bf4e96b`

**Résultat attendu** : la version actuelle (v14) et le prompt complet, sauvegardés dans `.state/prompt-history.json`.

Rejoue un snapshot après chaque changement de prompt pour créer un historique. Ensuite `action: diff` avec deux versions montre les différences, et `action: rollback` restaure une ancienne version.

### 4. regression_gate — la CI des prompts

- `assistantId` : `c7e088ff-8fe9-417c-ab31-d8bb6bf4e96b`
- `vertical` : `elagueur`
- `baselineScore` : `90`

**Résultat attendu** : `allowed: true` (car le score actuel est 100, donc ≥ 90).

Essaie ensuite `baselineScore: 101` → `allowed: false`, avec la raison « update blocked ».

### 5. deploy_agent — créer un nouvel agent en 1 commande

Attention : ce tool crée un **vrai assistant** dans ton compte Vapi. Pour tester sans polluer, utilise une entreprise fictive :

- `vertical` : `plombier`
- `company` : `Dépannage Express (test)`
- `extraKeywords` : `["Lille"]`

**Résultat attendu** : un `assistantId` nouveau, avec le greeting « Bonjour, vous êtes bien chez Dépannage Express (test)… ».

Vérifie ensuite dans ton dashboard Vapi : l'assistant existe. Tu peux le supprimer depuis le dashboard après le test.

## Étape 5 — Arrêter

Dans le terminal, tape `Ctrl+C`.

## Si quelque chose bloque

- **La page ne s'ouvre pas** → ouvre manuellement `http://localhost:6274` (l'URL complète avec le token s'affiche dans le terminal)
- **« Connect » ne marche pas** → le serveur n'a pas démarré : regarde le terminal, il y a une erreur (probablement une clé manquante dans les fichiers .env)
- **run_eval renvoie une erreur LLM** → la clé OpenAI dans `agent-voice/.env` est absente ou expirée
- **deploy_agent renvoie 402/403** → problème de billing ou de droits sur le compte Vapi

## Ce que tu viens de tester

Les 5 tools qui rendent ce MCP difficile à copier : déploiement d'une verticale complète en 1 commande, agent qui se teste lui-même, forensics audio automatisés, prompts versionnés comme du code, et une porte de régression CI. Le MCP officiel Vapi ne fait rien de tout ça — c'est un wrapper CRUD générique.
