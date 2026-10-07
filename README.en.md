# AI Novel Studio

**A self-hosted, n8n-controlled workbench for writing long-form novels with an LLM.**

AI Novel Studio wires an **n8n** workflow to a small **local writing server** that calls
any OpenAI-compatible language model. You request chapters over HTTP, the system enforces
a fixed narrative bible and outline, and every draft is archived as Markdown with
**resumable state** across sessions.

It ships with no keys, creates no accounts and spends no money on its own: if you don't
configure a provider, it calls nobody.

> 🇪🇸 Versión en español: [README.md](README.md)

---

## The problem it solves

Writing a long novel with an LLM hits three practical walls:

1. **Continuity loss.** The model forgets names, world rules and what it already wrote.
   This project feeds a **canon bible** and an **outline** into every request as mandatory
   context.
2. **Padding and waffle.** A loose chat produces prefaces, apologies and summaries instead
   of scenes. This project uses a strict **system prompt** plus a **validator** that rejects
   requests without objective, conflict and turn, and strips metatext.
3. **Fragile state.** If the process dies, the thread is lost. Here, every chapter writes a
   versioned `.md` under `project/chapters/` and updates `project/state.json` with the last
   chapter, so you can **resume**.

It is deliberately small and transparent: one workflow, one server, plain text files you can
read and edit by hand.

---

## Architecture

Three pieces, all local:

```
┌─────────────┐    POST /webhook/novel-draft    ┌──────────────────────┐
│   Client    │ ──────────────────────────────► │   n8n (port 5679)    │
│ (curl, app) │                                 │  workflow "Novel     │
└─────────────┘                                 │  Writer"             │
                                                └──────────┬───────────┘
                                                           │ HTTP POST /draft
                                                           ▼
                                                ┌──────────────────────┐
                                                │  Writer server       │
                                                │  Node.js (8788)      │
                                                │  novel-writer-server │
                                                └──────────┬───────────┘
                                                           │ OpenAI-compatible
                                                           │ /chat/completions
                                                           ▼
                                                ┌──────────────────────┐
                                                │  Your LLM provider   │
                                                │  (endpoint + free    │
                                                │   tier you verified) │
                                                └──────────────────────┘
```

1. **n8n** receives the request on a webhook and forwards it over HTTP.
2. **`scripts/novel-writer-server.js`** reads the bible and outline, builds the prompt,
   calls the model, saves the draft as Markdown and updates state.
3. **`project/`** is the project memory: canon, plan, chapters and `state.json`.

The server exposes two routes:

| Method | Route      | What it does                                      |
|--------|------------|---------------------------------------------------|
| GET    | `/health`  | Checks it's alive and whether a provider is set   |
| POST   | `/draft`   | Generates and archives one chapter                |

---

## Requirements

- **Node.js 20+** (uses native `fetch` and `AbortController`).
- **n8n** (2.x tested). Install with `npm install -g n8n` or use `npx n8n`.
- **An OpenAI-compatible endpoint** with a formal free tier, or your own local gateway.
  Without it the server runs but returns a configuration error when writing.
- Tested on **Windows with Git Bash**; the scripts are bash and should work on Linux/macOS.

---

## Step-by-step installation

```bash
# 1. Clone the repository
git clone https://github.com/khrizs3422/ai-novel-studio.git
cd ai-novel-studio

# 2. Create your config file from the example
cp .env.example .env

# 3. Edit .env and fill in at least the endpoint and the model
#    (see "Configuring without spending money" below)

# 4. Start the writer server (Terminal 1)
bash start-writer.sh
#   -> Novel Writer ready at http://127.0.0.1:8788

# 5. Start n8n (Terminal 2)
bash start-n8n.sh
#   -> open http://127.0.0.1:5679, complete the initial setup wizard

# 6. Import the workflow in the n8n UI:
#    Workflows -> Import from File -> workflow/Novel-Writer-Free-API.json
#    Then activate it.
```

Nothing leaves your machine: both services listen on `127.0.0.1` only.

---

## Configuring without spending money

The rule is simple: **you choose the endpoint and the model, and you verify yourself that
they're free**. The project ships no credentials and never silently falls back to a paid
model.

In `.env`:

```dotenv
NOVEL_LLM_BASE_URL=http://127.0.0.1:20128/v1
NOVEL_LLM_API_KEY=
NOVEL_LLM_MODEL=ID_OF_A_FREE_MODEL
```

- `NOVEL_LLM_BASE_URL` points to any OpenAI-compatible endpoint. Typical choices: a **local
  gateway** (e.g. a proxy unifying several providers), a `llama.cpp`/`Ollama` server with a
  compatible API, or a provider URL that offers a free tier.
- `NOVEL_LLM_API_KEY` may be **left empty** if your endpoint doesn't require auth.
- `NOVEL_LLM_MODEL` is the exact model id. Pick one with a large context window: the bible
  and outline go in every request.

Money-saving practices:

- Only use providers with a **declared free tier** and respect their terms.
- Don't switch models mid-arc: it changes the voice and breaks continuity.
- Start with a `dryRun` (see below) to validate without writing anything.
- The server performs **a single retry** on `429` (honoring `Retry-After`), never a request
  cascade and never a jump to a paid model.

---

## Usage

### 1. Check the server is alive

```bash
curl http://127.0.0.1:8788/health
```

```json
{ "ok": true, "service": "novel-writer", "port": 8788, "configured": true, "model": "ID_OF_A_FREE_MODEL" }
```

### 2. Request a chapter directly from the server

```bash
curl -X POST http://127.0.0.1:8788/draft \
  -H "Content-Type: application/json" \
  -d @examples/chapter-request.json
```

`examples/chapter-request.json` is the minimal request; this is what it contains:

```json
{
  "project": "New project",
  "chapterNumber": 1,
  "title": "The door without ash",
  "pov": "Protagonist",
  "objective": "Recover a document before it is destroyed.",
  "conflict": "The place is watched by someone who sees through the lie.",
  "turn": "The document proves their family started the war.",
  "cliffhanger": "A voice behind the door speaks their true name.",
  "targetWords": 2200,
  "temperature": 0.85,
  "maxTokens": 4000
}
```

Response:

```json
{
  "ok": true,
  "chapter": 1,
  "title": "The door without ash",
  "file": "project/chapters/001-the-door-without-ash-v1.md",
  "words": 2143,
  "status": "borrador"
}
```

### 3. Validate without writing (`dryRun`)

Add `"dryRun": true` to the body so the server validates the request without spending
tokens or creating a file:

```bash
curl -X POST http://127.0.0.1:8788/draft \
  -H "Content-Type: application/json" \
  -d '{"chapterNumber":1,"title":"Test","pov":"X","objective":"a","conflict":"b","turn":"c","dryRun":true}'
```

```json
{ "ok": true, "dryRun": true, "chapter": 1, "title": "Test", "words": 0, "status": "validado-sin-escritura" }
```

### 4. Use the n8n path (the project's own route)

With n8n running and the workflow imported, the same request goes through the webhook:

```bash
curl -X POST http://127.0.0.1:5679/webhook/novel-draft \
  -H "Content-Type: application/json" \
  -d @examples/chapter-request.json
```

n8n forwards the body as-is to the server and returns its response. The workflow
`workflow/Novel-Writer-Free-API.json` has three nodes: **Webhook → HTTP Request → Respond to Webhook**.

### 5. A real-world example

`examples/chapter-001-request.json` holds the request for a full chapter with project, POV,
conflict and cliffhanger defined, so you can see the level of detail the system expects.

---

## Folder structure

```text
ai-novel-studio/
├── .env.example                       # Config template (no secrets)
├── .gitignore
├── LICENSE                            # MIT
├── README.md                          # Spanish version
├── README.en.md                       # This document (EN)
├── start-writer.sh                    # Starts the writer server
├── start-n8n.sh                       # Starts isolated n8n (127.0.0.1)
├── remove-novel-studio.sh             # Deletes the whole project (with confirmation)
├── scripts/
│   └── novel-writer-server.js         # Local API: /health and /draft
├── workflow/
│   └── Novel-Writer-Free-API.json     # n8n workflow (Webhook → HTTP → Respond)
├── workflows/
│   └── gmail-event-processor.json     # Auxiliary example workflow (IMAP → processing)
├── data/
│   └── published-workflow.json        # Reference export of the writing workflow
├── examples/
│   ├── chapter-request.json           # Minimal chapter request
│   ├── chapter-001-request.json       # Real request with conflict and turn
│   └── gpt-oss-probe.json             # Raw probe of the model endpoint
└── project/
    ├── 00-biblia-narrativa.md         # Canon (world, characters, rules)
    ├── 00-investigacion-historica.md  # Historical frame and sources
    ├── 01-escaleta.md                 # 42-chapter outline
    ├── 02-protocolo-agentes.md        # Quality rules and editorial flow
    ├── state.json                     # Resumable state (last chapter, index)
    └── chapters/
        └── 001-la-dalca-varada-v1.md  # Example chapter (discarded draft)
```

### How to resume

`project/state.json` holds the chapter index and `nextChapter`. To continue, edit
`project/01-escaleta.md` if needed and fire another request with the next chapter number.
The server never overwrites your canon: it only adds new `.md` files to
`project/chapters/` and updates the index.

---

## Real limitations

- **It's a draft generator, not a novelist.** Text quality depends on the model you connect.
  A free model is fine for planning and first passes, not a guarantee of publishable prose.
- **The sample chapter is discarded on purpose.** `project/chapters/001-...md` is kept only
  as a format sample; `state.json` marks it `rechazado-por-control-editorial` (it fell short
  of the word target).
- **No streaming.** `/draft` waits for the model's full response (180 s timeout), so long
  outputs can take a while.
- **One chapter per request.** No batch generation: the design forces review before moving
  on, which is the point.
- **No n8n execution data in the repo.** n8n's internal database lives in `data/n8n/` and is
  excluded by `.gitignore`.
- **Minimal security.** Everything listens on loopback and without auth. If you expose this
  to the Internet (n8n with `N8N_SECURE_COOKIE=false`), anyone could read and edit your
  workflows. **Don't** do it without TLS and access control.
- **Indirect prompt injection.** If your sources or canon files contain third-party text,
  treat them as untrusted data.

---

## License

[MIT](LICENSE) © 2026 Christopher Aguila.
