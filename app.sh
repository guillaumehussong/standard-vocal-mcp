#!/usr/bin/env bash
# Lance l'interface client Standard Vocal (créer son agent en 3 clics).
# Usage : ./app.sh
set -e
cd "$(dirname "$0")"

export VAPI_TOKEN=$(grep '^VAPI_API_KEY=' /Users/guillaumehussong/Projects/agent-logs/.env.local | cut -d= -f2)
export OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' /Users/guillaumehussong/Projects/agent-voice/.env | cut -d= -f2)
export ELEVENLABS_API_KEY=$(grep '^ELEVENLABS_API_KEY=' /Users/guillaumehussong/Projects/agent-voice/.env | cut -d= -f2)

if [ -z "$VAPI_TOKEN" ] || [ -z "$OPENAI_API_KEY" ]; then
  echo "✗ Clé manquante. Vérifie agent-logs/.env.local et agent-voice/.env"
  exit 1
fi

npm run build > /dev/null 2>&1

echo ""
echo "Standard Vocal est prêt :"
echo "  http://localhost:6274"
echo ""
(sleep 1; open "http://localhost:6274") &
node dist/app.js
