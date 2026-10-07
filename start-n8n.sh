#!/usr/bin/env bash
# Arranque de n8n para AI Novel Studio.
# Usa un runtime de n8n propio y aislado dentro de la carpeta del proyecto,
# para no tocar la instalación global ni compartir base de datos.
#
# Requisitos: Node.js 20+ y n8n instalado (npm i -g n8n) o accesible vía npx.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

[ -f .env ] || cp .env.example .env
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p data/n8n project/chapters

# n8n guarda su estado bajo N8N_USER_FOLDER. Exportamos una ruta absoluta
# para que quede dentro de la carpeta aislada del proyecto.
ROOT_WIN="$(cygpath -w "$ROOT" 2>/dev/null || echo "$ROOT")"
export N8N_USER_FOLDER="${ROOT_WIN}\\data\\n8n"
export N8N_PORT="${N8N_PORT:-5679}"

# Aísla el broker de tareas de n8n en loopback para no chocar con su puerto.
export N8N_RUNNERS_ENABLED="true"
export N8N_RUNNERS_BROKER_LISTEN_ADDRESS="127.0.0.1"
export N8N_RUNNERS_BROKER_PORT="${N8N_RUNNERS_BROKER_PORT:-5680}"

# Por defecto enlazamos sólo a localhost. NO expongas esta instancia a Internet
# sin TLS y sin autenticación: cualquiera podría leer/editar tus workflows.
export N8N_LISTEN_ADDRESS="127.0.0.1"
export N8N_HOST="127.0.0.1"
export N8N_PROTOCOL="http"
export N8N_EDITOR_BASE_URL="http://127.0.0.1:${N8N_PORT}"
export WEBHOOK_URL="http://127.0.0.1:${N8N_PORT}/"

# Lanza n8n (usa el binario global si existe; si no, cae a npx).
if command -v n8n >/dev/null 2>&1; then
  exec n8n start
else
  exec npx --yes n8n start
fi
