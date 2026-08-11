#!/usr/bin/env bash
# Lance l'interface de test du MCP Standard Vocal.
# Récupère les clés tout seul depuis les projets voisins. Usage : ./test.sh
set -e
cd "$(dirname "$0")"

echo "▸ Récupération des clés..."
export VAPI_TOKEN=$(grep '^VAPI_API_KEY=' /Users/guillaumehussong/Projects/agent-logs/.env.local | cut -d= -f2)
export OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' /Users/guillaumehussong/Projects/agent-voice/.env | cut -d= -f2)

if [ -z "$VAPI_TOKEN" ] || [ -z "$OPENAI_API_KEY" ]; then
  echo "✗ Clé manquante. Vérifie agent-logs/.env.local et agent-voice/.env"
  exit 1
fi

echo "▸ Build..."
npm run build

echo ""
echo "▸ Lancement de l'interface de test..."
echo "   Une page web va s'ouvrir (première fois = ~30 s de téléchargement)."
echo "   URL : http://localhost:6274"
echo ""
npx --yes @modelcontextprotocol/inspector \
  -e VAPI_TOKEN="$VAPI_TOKEN" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  node dist/index.js
