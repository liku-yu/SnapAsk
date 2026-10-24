#!/usr/bin/env bash
set -euo pipefail

# Set the GitHub repository description, homepage, and topics.
# Requires a token with permission to edit repository metadata:
#   export GITHUB_TOKEN=ghp_xxx
#   ./tools/set-repo-metadata.sh
#
# Optional: REPO=owner/name ./tools/set-repo-metadata.sh

: "${GITHUB_TOKEN:?Please export GITHUB_TOKEN with repository metadata write access}"

REPO="${REPO:-liku-yu/SnapAsk}"
API="https://api.github.com/repos/${REPO}"
DESCRIPTION="截图即问：浏览器截图自动弹出 AI 解答。Chrome/Edge MV3，支持 OpenAI 兼容 / Anthropic / 本地 Ollama / DeepSeek 与 ChatGPT 网页版。"
HOMEPAGE="https://github.com/${REPO}#readme"

echo "Updating ${REPO} ..."

curl -fsS -X PATCH \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${API}" \
  --data @- >/dev/null <<JSON
{"description":"${DESCRIPTION}","homepage":"${HOMEPAGE}"}
JSON

curl -fsS -X PUT \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${API}/topics" \
  --data @- >/dev/null <<'JSON'
{"names":["chrome-extension","edge-extension","manifest-v3","screenshot","ai","vision","openai","anthropic","deepseek","chatgpt","ollama","browser-extension","privacy"]}
JSON

echo "Done: https://github.com/${REPO}"
