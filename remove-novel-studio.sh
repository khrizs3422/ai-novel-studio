#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" != "--confirm-delete" ]; then
  echo "Esto borrará AI-Novel-Studio completo, incluidos capítulos, estado y datos locales de n8n."
  echo "Uso: bash remove-novel-studio.sh --confirm-delete"
  exit 2
fi
cd "$(dirname "$ROOT")"
rm -rf "$ROOT"
echo "AI-Novel-Studio eliminado."
