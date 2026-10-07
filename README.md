# AI Novel Studio

**Un taller de escritura de novelas largo, autoalojado y controlado por n8n.**

AI Novel Studio conecta un flujo de trabajo de **n8n** con un pequeño **servidor local
de escritura** que llama a un modelo de lenguaje compatible con la API de OpenAI.
El resultado: puedes pedir capítulos por HTTP, el sistema respeta una biblia narrativa
y una escaleta fijas, y cada borrador queda archivado en Markdown con **estado
reanudable** entre sesiones.

No incluye claves, no crea cuentas y no gasta dinero por sí solo: si no configuras un
proveedor, no llama a nadie.

> 🇬🇧 English version: [README.en.md](README.en.md)

---

## El problema que resuelve

Escribir una novela larga con un LLM tiene tres problemas prácticos:

1. **Pérdida de continuidad.** El modelo olvida nombres, reglas del mundo y lo que ya
   escribió. Solución aquí: una **biblia de canon** y una **escaleta** que se inyectan
   en cada petición como contexto obligatorio.
2. **Prolijidad y relleno.** Un chat suelto produce prefacios, disculpas y resúmenes
   en vez de escena. Solución aquí: un **prompt de sistema** estricto y un **validador**
   que rechaza encargos sin objetivo, conflicto y giro, y que limpia el metatexto.
3. **Estado frágil.** Si el proceso muere, se pierde el hilo. Solución aquí: cada
   capítulo genera un `.md` versionado en `project/chapters/` y actualiza
   `project/state.json` con el último capítulo escrito, para poder **reanudar**.

Es deliberadamente simple y transparente: un workflow, un servidor, archivos de texto
que puedes leer y editar a mano.

---

## Arquitectura

Tres piezas, todas locales:

```
┌─────────────┐    POST /webhook/novel-draft    ┌──────────────────────┐
│  Cliente    │ ──────────────────────────────► │   n8n (puerto 5679)  │
│ (curl, app) │                                 │  workflow "Novel     │
└─────────────┘                                 │  Writer"             │
                                                └──────────┬───────────┘
                                                           │ HTTP POST /draft
                                                           ▼
                                                ┌──────────────────────┐
                                                │ Servidor escritor    │
                                                │ Node.js (8788)       │
                                                │ novel-writer-server  │
                                                └──────────┬───────────┘
                                                           │ OpenAI-compatible
                                                           │ /chat/completions
                                                           ▼
                                                ┌──────────────────────┐
                                                │ Tu proveedor de LLM  │
                                                │ (endpoint + cuota    │
                                                │  gratuita formal)    │
                                                └──────────────────────┘
```

1. **n8n** recibe el encargo por un webhook y lo reenvía por HTTP.
2. **`scripts/novel-writer-server.js`** lee la biblia y la escaleta, arma el prompt,
   llama al modelo, guarda el borrador en Markdown y actualiza el estado.
3. **`project/`** es la memoria del proyecto: canon, plan, capítulos y `state.json`.

El servidor expone dos rutas:

| Método | Ruta       | Qué hace                                              |
|--------|------------|-------------------------------------------------------|
| GET    | `/health`  | Comprueba que está vivo y si hay proveedor configurado |
| POST   | `/draft`   | Genera y archiva un capítulo                          |

---

## Requisitos

- **Node.js 20 o superior** (usa `fetch` nativo y `AbortController`).
- **n8n** (version 2.x probada). Instálalo con `npm install -g n8n` o usa `npx n8n`.
- **Un endpoint compatible con OpenAI** con cuota gratuita formal, o un gateway local
  propio. Sin él, el servidor funciona pero devuelve error de configuración al escribir.
- Sistema probado en **Windows con Git Bash**; los scripts son de bash y deberían
  funcionar igual en Linux/macOS.

---

## Instalación paso a paso

```bash
# 1. Clona el repositorio
git clone https://github.com/khrizs3422/ai-novel-studio.git
cd ai-novel-studio

# 2. Crea tu archivo de configuración a partir del ejemplo
cp .env.example .env

# 3. Edita .env y rellena al menos el endpoint y el modelo
#    (ver "Configuración sin gastar dinero" más abajo)

# 4. Arranca el servidor del escritor (Terminal 1)
bash start-writer.sh
#   -> Novel Writer listo en http://127.0.0.1:8788

# 5. Arranca n8n (Terminal 2)
bash start-n8n.sh
#   -> abre http://127.0.0.1:5679, completa el asistente inicial

# 6. Importa el workflow en la UI de n8n:
#    Workflows -> Import from File -> workflow/Novel-Writer-Free-API.json
#    Luego actívalo.
```

Nada sale de tu máquina: ambos servicios escuchan sólo en `127.0.0.1`.

---

## Configuración sin gastar dinero

La regla es simple: **tú eliges el endpoint y el modelo, y verificas tú mismo que sean
gratuitos**. El proyecto no trae ninguna credencial ni hace fallback automático a nada
pagado.

En `.env`:

```dotenv
NOVEL_LLM_BASE_URL=http://127.0.0.1:20128/v1
NOVEL_LLM_API_KEY=
NOVEL_LLM_MODEL=ID_DE_UN_MODELO_GRATUITO
```

- `NOVEL_LLM_BASE_URL` apunta a cualquier endpoint OpenAI-compatible. Opciones típicas:
  un **gateway local** (por ejemplo, un proxy que unifique varios proveedores),
  un `llama.cpp`/`Ollama` con API compatible, o directamente la URL de un proveedor
  con tier gratuito.
- `NOVEL_LLM_API_KEY` puede quedar **vacío** si tu endpoint no exige autenticación.
- `NOVEL_LLM_MODEL` es el identificador exacto del modelo. Elige uno con contexto amplio:
  la biblia y la escaleta van en cada petición.

Buenas prácticas para no gastar:

- Usa sólo proveedores con **cuota gratuita declarada** y respeta sus términos.
- No cambies de modelo a mitad de un arco narrativo: altera la voz y rompe continuidad.
- Empieza con un `dryRun` (ver más abajo) para validar sin escribir nada.
- El servidor tiene **un solo reintento** ante `429` (respeta `Retry-After`), nunca una
  cascada de peticiones ni un salto a un modelo de pago.

---

## Uso

### 1. Comprobar que el servidor está vivo

```bash
curl http://127.0.0.1:8788/health
```

```json
{ "ok": true, "service": "novel-writer", "port": 8788, "configured": true, "model": "ID_DE_UN_MODELO_GRATUITO" }
```

### 2. Pedir un capítulo directamente al servidor

```bash
curl -X POST http://127.0.0.1:8788/draft \
  -H "Content-Type: application/json" \
  -d @examples/chapter-request.json
```

`examples/chapter-request.json` es el encargo mínimo; esto es lo que contiene:

```json
{
  "project": "Proyecto nuevo",
  "chapterNumber": 1,
  "title": "La puerta sin ceniza",
  "pov": "Protagonista",
  "objective": "Recuperar un documento antes de que lo destruyan.",
  "conflict": "El lugar está vigilado por alguien que reconoce su mentira.",
  "turn": "El documento prueba que su familia inició la guerra.",
  "cliffhanger": "Una voz tras la puerta pronuncia su nombre verdadero.",
  "targetWords": 2200,
  "temperature": 0.85,
  "maxTokens": 4000
}
```

Respuesta:

```json
{
  "ok": true,
  "chapter": 1,
  "title": "La puerta sin ceniza",
  "file": "project/chapters/001-la-puerta-sin-ceniza-v1.md",
  "words": 2143,
  "status": "borrador"
}
```

### 3. Validar sin escribir (`dryRun`)

Añade `"dryRun": true` al cuerpo para que el servidor valide el encargo sin gastar tokens
ni crear archivo:

```bash
curl -X POST http://127.0.0.1:8788/draft \
  -H "Content-Type: application/json" \
  -d '{"chapterNumber":1,"title":"Prueba","pov":"X","objective":"a","conflict":"b","turn":"c","dryRun":true}'
```

```json
{ "ok": true, "dryRun": true, "chapter": 1, "title": "Prueba", "words": 0, "status": "validado-sin-escritura" }
```

### 4. Usar la vía n8n (la del proyecto)

Con n8n activo y el workflow importado, el mismo encargo va por el webhook:

```bash
curl -X POST http://127.0.0.1:5679/webhook/novel-draft \
  -H "Content-Type: application/json" \
  -d @examples/chapter-request.json
```

n8n reenvía el cuerpo tal cual al servidor y devuelve su respuesta. El workflow
`workflow/Novel-Writer-Free-API.json` tiene tres nodos: **Webhook → HTTP Request → Respond to Webhook**.

### 5. Ejemplo de mundo real

`examples/chapter-001-request.json` contiene el encargo de un capítulo completo con
proyecto, POV, conflicto y cliffhanger definidos, para que veas el nivel de detalle que
espera el sistema.

---

## Estructura de carpetas

```text
ai-novel-studio/
├── .env.example                       # Plantilla de configuración (sin secretos)
├── .gitignore
├── LICENSE                            # MIT
├── README.md                          # Este documento (ES)
├── README.en.md                       # Versión en inglés
├── start-writer.sh                    # Arranca el servidor del escritor
├── start-n8n.sh                       # Arranca n8n aislado (127.0.0.1)
├── remove-novel-studio.sh             # Borra todo el proyecto (con confirmación)
├── scripts/
│   └── novel-writer-server.js         # API local: /health y /draft
├── workflow/
│   └── Novel-Writer-Free-API.json     # Workflow n8n (Webhook → HTTP → Respond)
├── workflows/
│   └── gmail-event-processor.json     # Workflow auxiliar de ejemplo (IMAP → procesado)
├── data/
│   └── published-workflow.json        # Export de referencia del workflow de escritura
├── examples/
│   ├── chapter-request.json           # Encargo mínimo de capítulo
│   ├── chapter-001-request.json       # Encargo real, con conflicto y giro
│   └── gpt-oss-probe.json             # Prueba cruda del endpoint del modelo
└── project/
    ├── 00-biblia-narrativa.md         # Canon obligatorio (mundo, personajes, reglas)
    ├── 00-investigacion-historica.md  # Marco histórico y fuentes
    ├── 01-escaleta.md                 # Plan de 42 capítulos
    ├── 02-protocolo-agentes.md        # Reglas de calidad y flujo editorial
    ├── state.json                     # Estado reanudable (último capítulo, índice)
    └── chapters/
        └── 001-la-dalca-varada-v1.md  # Capítulo de ejemplo (borrador descartado)
```

### Cómo reanudar

`project/state.json` guarda el índice de capítulos y `nextChapter`. Para continuar,
edita `project/01-escaleta.md` si hace falta y vuelve a lanzar un encargo con el número
de capítulo siguiente. El servidor nunca sobrescribe tu canon: sólo añade `.md` nuevos a
`project/chapters/` y actualiza el índice.

---

## Limitaciones reales

- **Es un generador de borradores, no un novelista.** La calidad del texto depende del
  modelo que conectes. Un modelo gratuito sirve para planificar y para primeras pasadas,
  no garantiza prosa publicable.
- **El capítulo de ejemplo está descartado a propósito.** `project/chapters/001-...md`
  se conserva sólo como muestra del formato de salida; el `state.json` lo marca como
  `rechazado-por-control-editorial` (quedó por debajo del objetivo de palabras).
- **Sin streaming.** `/draft` espera la respuesta completa del modelo (timeout de 180 s),
  por lo que con salidas largas puede tardar.
- **Un capítulo por petición.** No hay generación por lotes: el diseño obliga a revisar
  antes de avanzar, que es justamente el punto.
- **Sin persistencia de ejecuciones de n8n en el repo.** La base de datos interna de n8n
  va en `data/n8n/` y está excluida por `.gitignore`.
- **Seguridad mínima.** Todo escucha en loopback y sin autenticación. Si exponés esto a
  Internet (n8n con `N8N_SECURE_COOKIE=false`), cualquiera podría leer y editar tus
  workflows. **No lo hagas** sin TLS y control de acceso.
- **Prompt injection indirecta.** Si tus fuentes o archivos de canon contienen texto de
  terceros, trátalos como datos no confiables.

---

## Licencia

[MIT](LICENSE) © 2026 Christopher Aguila.
