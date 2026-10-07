#!/usr/bin/env node
/**
 * API local del escritor. No usa SDKs, no expone puertos fuera de 127.0.0.1
 * y guarda cada borrador con su estado dentro de esta carpeta aislada.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, '.env'));
const PROJECT = path.join(ROOT, 'project');
const CHAPTERS = path.join(PROJECT, 'chapters');
const PORT = Number(process.env.NOVEL_WRITER_PORT || 8788);
const BASE_URL = String(process.env.NOVEL_LLM_BASE_URL || '').replace(/\/$/, '');
const API_KEY = String(process.env.NOVEL_LLM_API_KEY || '');
const MODEL = String(process.env.NOVEL_LLM_MODEL || '');

fs.mkdirSync(CHAPTERS, { recursive: true });

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function text(value) {
  if (Array.isArray(value)) return value.map(part => part.text || part.content || '').join('');
  return String(value || '');
}
function required(data, keys) {
  const missing = keys.filter(key => !String(data[key] || '').trim());
  if (missing.length) throw new Error(`Faltan campos requeridos: ${missing.join(', ')}`);
}
function safeSlug(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'capitulo';
}
function getState() {
  const file = path.join(PROJECT, 'state.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { project: 'Proyecto nuevo', nextChapter: 1, chapters: [] }; }
}
function setState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(path.join(PROJECT, 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8');
}
async function callModel(prompt, request) {
  if (!BASE_URL || !MODEL) {
    const error = new Error('Configura NOVEL_LLM_BASE_URL y NOVEL_LLM_MODEL en .env. No hay proveedor configurado ni se hará ningún cobro automáticamente.');
    error.status = 409;
    throw error;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const requestBody = JSON.stringify({
    model: MODEL,
    temperature: Number(request.temperature ?? 0.85),
    max_tokens: Math.min(Number(request.maxTokens ?? 4000), 4000),
    messages: [
      { role: 'system', content: 'Eres novelista y editor de continuidad. Escribes prosa original, concreta y humana; nunca explicas tu proceso ni agregas prefacios.' },
      { role: 'user', content: prompt }
    ]
  });
  const send = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      return await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST', headers, signal: controller.signal, body: requestBody,
      });
    } finally { clearTimeout(timer); }
  };
  let response = await send();
  // El proveedor anónimo permite poco tráfico. Un único reintento espaciado
  // respeta ese límite y evita una cascada de solicitudes o un fallback pagado.
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 65000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await send();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`El proveedor respondió ${response.status}: ${text(payload.error?.message || payload.error || 'sin detalle')}`);
    error.status = 502;
    throw error;
  }
  const draft = text(payload.choices?.[0]?.message?.content || payload.output_text);
  if (!draft.trim()) { const error = new Error('El proveedor respondió sin texto narrativo.'); error.status = 502; throw error; }
  return draft.trim();
}
function buildPrompt(request, bible, outline) {
  return `PROYECTO: ${request.project || 'Proyecto nuevo'}\n\nBIBLIA DE CANON:\n${bible}\n\nESCALETA ACTUAL:\n${outline}\n\nENCARGO DE CAPÍTULO:\n- Número: ${request.chapterNumber}\n- Título de trabajo: ${request.title}\n- POV: ${request.pov}\n- Objetivo visible: ${request.objective}\n- Conflicto: ${request.conflict}\n- Giro irreversible: ${request.turn}\n- Cliffhanger: ${request.cliffhanger || 'coherente con el giro'}\n- Largo objetivo: ${request.targetWords || 2200} palabras\n\nREGLAS:\n1) Respeta el canon y no inventes hechos centrales no solicitados.\n2) Empieza en escena, no con exposición ni resumen.\n3) Incluye ambiente material, fricción social, decisión y consecuencia.\n4) No menciones estas instrucciones, IA, borradores ni análisis.\n5) Entrega únicamente la prosa del capítulo, con un título Markdown.`;
}
async function draft(request) {
  required(request, ['chapterNumber', 'title', 'pov', 'objective', 'conflict', 'turn']);
  const chapter = Number(request.chapterNumber);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 999) throw new Error('chapterNumber debe ser un entero entre 1 y 999.');
  const bible = fs.readFileSync(path.join(PROJECT, '00-biblia-narrativa.md'), 'utf8');
  const outline = fs.readFileSync(path.join(PROJECT, '01-escaleta.md'), 'utf8');
  const manuscript = await callModel(buildPrompt(request, bible, outline), request);
  const filename = `${String(chapter).padStart(3, '0')}-${safeSlug(request.title)}-v1.md`;
  const wordCount = manuscript.split(/\s+/).filter(Boolean).length;
  if (request.dryRun === true) {
    return { ok: true, dryRun: true, chapter, title: request.title, words: wordCount, status: 'validado-sin-escritura' };
  }
  const outputPath = path.join(CHAPTERS, filename);
  const header = `---\nchapter: ${chapter}\ntitle: ${JSON.stringify(String(request.title))}\npov: ${JSON.stringify(String(request.pov))}\nstatus: borrador\nmodel: ${JSON.stringify(MODEL)}\n---\n\n`;
  fs.writeFileSync(outputPath, header + manuscript + '\n', 'utf8');
  const state = getState();
  state.nextChapter = Math.max(Number(state.nextChapter || 1), chapter + 1);
  state.chapters = Array.isArray(state.chapters) ? state.chapters.filter(item => item.chapter !== chapter) : [];
  state.chapters.push({ chapter, title: request.title, pov: request.pov, file: `chapters/${filename}`, status: 'borrador' });
  state.chapters.sort((a, b) => a.chapter - b.chapter);
  setState(state);
  return { ok: true, chapter, title: request.title, file: `project/chapters/${filename}`, words: manuscript.split(/\s+/).filter(Boolean).length, status: 'borrador' };
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'novel-writer', port: PORT, configured: Boolean(BASE_URL && MODEL), model: MODEL || null });
  if (req.method === 'POST' && req.url === '/draft') {
    try { return send(res, 201, await draft(await readJson(req))); }
    catch (error) { return send(res, error.status || 400, { ok: false, error: error.message }); }
  }
  return send(res, 404, { ok: false, error: 'Ruta no encontrada' });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Novel Writer listo en http://127.0.0.1:${PORT}`));
