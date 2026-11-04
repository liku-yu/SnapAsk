#!/usr/bin/env bash
set -euo pipefail

# Set the CNB repository description, site, and topics.
# Requires a CNB token with repo-manage:rw:
#   export CNB_TOKEN=...
#   ./tools/set-cnb-metadata.sh
#
# Optional: REPO=owner/name ./tools/set-cnb-metadata.sh

: "${CNB_TOKEN:?Please export CNB_TOKEN with repo-manage:rw}"

REPO="${REPO:-liku-yu/SnapAsk}"
API="https://api.cnb.cool/${REPO}"
DESCRIPTION="截图即问：浏览器截图自动弹出 AI 解答。支持 GPT / DeepSeek / GLM / Claude / Gemini / Ollama 与 DeepSeek/ChatGPT 网页版。"
SITE="https://github.com/liku-yu/SnapAsk#readme"

echo "Updating ${REPO} ..."

curl -fsS -X PATCH \
  -H "Authorization: Bearer ${CNB_TOKEN}" \
  -H "Accept: application/vnd.cnb.api+json" \
  -H "Content-Type: application/json" \
  "${API}" \
  --data @- >/dev/null <<JSON
{"description":"${DESCRIPTION}","site":"${SITE}","topics":["chrome-extension","edge-extension","manifest-v3","screenshot","ai","vision","openai","anthropic","deepseek","chatgpt","ollama","browser-extension","privacy","gemini","glm"]}
JSON

echo "Done: https://cnb.cool/${REPO}"
