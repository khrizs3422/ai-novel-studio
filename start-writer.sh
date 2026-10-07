#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
[ -f .env ] || cp .env.example .env
exec node scripts/novel-writer-server.js
