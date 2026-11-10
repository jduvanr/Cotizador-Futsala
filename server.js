/* Servidor del cotizador: sirve el sitio + guarda cotizaciones en SQLite.
   Uso:  node server.js        (requiere Node 22.5+)
   Supabase: define SUPABASE_URL y SUPABASE_SERVICE_KEY (y opcional SUPABASE_TABLE). Sin ellas usa SQLite local.
   Variables: PORT (8080), ADMIN_PASSWORD (clave del panel /admin.html), DB_PATH (data/cotizaciones.db) */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const P = require("./pricing.js");

const PORT = Number(process.env.PORT) || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "futsala2026";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "cotizaciones.db");
const MAX_DATE = "2028-12-31";

if (!process.env.ADMIN_PASSWORD) console.warn("⚠️  Usando clave de admin por defecto. Define ADMIN_PASSWORD antes de publicar.");

/* ---------- almacenamiento: Supabase si hay credenciales, si no SQLite local ---------- */
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const TABLE = process.env.SUPABASE_TABLE || "cotizaciones";

function sqliteStore() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS cotizaciones (
    id TEXT PRIMARY KEY, creado TEXT NOT NULL, actualizado TEXT NOT NULL, evento TEXT NOT NULL, organizador TEXT NOT NULL,
    telefono TEXT NOT NULL, fecha TEXT NOT NULL, lugar TEXT NOT NULL, partidos TEXT NOT NULL, camaras TEXT NOT NULL,
    sin_servicios TEXT NOT NULL DEFAULT '', valor_base REAL NOT NULL, valor_cotizado REAL NOT NULL,
    siguio_redes INTEGER NOT NULL DEFAULT 0, valor_final REAL NOT NULL, contacto_whatsapp INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo', notas TEXT NOT NULL DEFAULT '')`);
  const out = r => r && { ...r, siguio_redes: !!r.siguio_redes, contacto_whatsapp: !!r.contacto_whatsapp };
  const COLS = new Set(["evento","organizador","telefono","fecha","lugar","partidos","camaras","sin_servicios","valor_base","valor_cotizado","siguio_redes","valor_final","contacto_whatsapp","estado","notas","actualizado"]);
  return {
    name: "SQLite (" + DB_PATH + ")",
    async insert(r) {
      const k = Object.keys(r);
      db.prepare(`INSERT INTO cotizaciones (${k.join(",")}) VALUES (${k.map(() => "?").join(",")})`).run(...k.map(c => typeof r[c] === "boolean" ? +r[c] : r[c]));
    },
    async get(id) { return out(db.prepare("SELECT * FROM cotizaciones WHERE id=?").get(id)); },
    async update(id, f) {
      const k = Object.keys(f).filter(c => COLS.has(c));
      db.prepare(`UPDATE cotizaciones SET ${k.map(c => c + "=?").join(",")} WHERE id=?`).run(...k.map(c => typeof f[c] === "boolean" ? +f[c] : f[c]), id);
    },
    async all() { return db.prepare("SELECT * FROM cotizaciones ORDER BY creado DESC").all().map(out); },
    async remove(id) { db.prepare("DELETE FROM cotizaciones WHERE id=?").run(id); },
  };
}

function supabaseStore() {
  const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };
  const base = `${SB_URL}/rest/v1/${TABLE}`;
  async function call(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("Supabase " + r.status + ": " + (await r.text()).slice(0, 300));
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  const q = id => `?id=eq.${encodeURIComponent(id)}`;
  return {
    name: "Supabase (" + SB_URL + ", tabla " + TABLE + ")",
    async insert(r) { await call(base, { method: "POST", body: JSON.stringify(r), headers: { Prefer: "return=minimal" } }); },
    async get(id) { const rows = await call(base + q(id) + "&select=*"); return rows && rows[0]; },
    async update(id, f) { await call(base + q(id), { method: "PATCH", body: JSON.stringify(f), headers: { Prefer: "return=minimal" } }); },
    async all() { return (await call(base + "?select=*&order=creado.desc&limit=10000")) || []; },
    async remove(id) { await call(base + q(id), { method: "DELETE", headers: { Prefer: "return=minimal" } }); },
  };
}
const store = SB_URL && SB_KEY ? supabaseStore() : sqliteStore();
console.log("Almacenamiento:", store.name);

const ESTADOS = ["nuevo", "contactado", "negociando", "cerrado", "perdido"];

/* ---------- utilidades ---------- */
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
function send(res, code, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 20_000) { reject(new Error("big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function isAdmin(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const pass = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = crypto.createHash("sha256").update(pass).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const hits = new Map(); // límite simple por IP: 30 cotizaciones/hora
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3_600_000);
  arr.push(now); hits.set(ip, arr); return arr.length > 30;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  // Detrás del proxy del hosting, la IP real viene en x-forwarded-for (la última la añade el proxy)
  const ip = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "?";
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "cotizaciones", id?]

  // Crear cotización (público)
  if (req.method === "POST" && parts[1] === "cotizaciones" && !parts[2]) {
    if (limited(ip)) return send(res, 429, { error: "Demasiadas solicitudes" });
    const b = await readJson(req);
    const evento = clean(b.evento, 120), organizador = clean(b.organizador, 120),
          telefono = String(b.telefono ?? "").replace(/\D/g, ""), lugar = clean(b.lugar, 160), fecha = clean(b.fecha, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (!evento || !organizador || !lugar) return send(res, 400, { error: "Faltan datos del evento" });
    if (!/^3\d{9}$/.test(telefono)) return send(res, 400, { error: "Teléfono inválido" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha <= today || fecha > MAX_DATE) return send(res, 400, { error: "Fecha inválida" });
    const q = P.calcular(b.partidos, b.camaras, b.extras, false);
    if (!q) return send(res, 400, { error: "Opciones inválidas" });
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await store.insert({ id, creado: now, actualizado: now, evento, organizador, telefono, fecha, lugar,
      partidos: q.p.titulo, camaras: q.cam.titulo, sin_servicios: q.extras.join(", "),
      valor_base: q.base, valor_cotizado: q.subtotal, valor_final: q.subtotal });
    return send(res, 201, { id });
  }

  // Actualizar acciones del cliente (público, requiere conocer el id aleatorio)
  if (req.method === "PATCH" && parts[1] === "cotizaciones" && parts[2]) {
    const cur = await store.get(parts[2]);
    if (!cur) return send(res, 404, { error: "No existe" });
    const b = await readJson(req);
    const siguio = !!(b.siguio_redes || cur.siguio_redes);
    const wa = !!(b.contacto_whatsapp || cur.contacto_whatsapp);
    const extras = cur.sin_servicios ? cur.sin_servicios.split(", ") : [];
    const pid = P.PARTIDOS.find(x => x.titulo === cur.partidos).id;
    const cid = P.CAMARAS.find(x => x.titulo === cur.camaras).id;
    const q = P.calcular(pid, cid, extras, siguio);
    await store.update(cur.id, { siguio_redes: siguio, contacto_whatsapp: wa, valor_final: q.total, actualizado: new Date().toISOString() });
    return send(res, 200, { ok: true, total: q.total });
  }

  // Panel admin
  if (parts[1] === "admin") {
    if (!isAdmin(req)) return send(res, 401, { error: "No autorizado" }, "application/json", { "WWW-Authenticate": 'Basic realm="futsala admin"' });
    if (req.method === "GET" && parts[2] === "cotizaciones")
      return send(res, 200, await store.all());
    if (req.method === "PATCH" && parts[2] === "cotizaciones" && parts[3]) {
      const b = await readJson(req);
      const cur = await store.get(parts[3]);
      if (!cur) return send(res, 404, { error: "No existe" });
      if (b.estado !== undefined) {
        if (!ESTADOS.includes(b.estado)) return send(res, 400, { error: "Estado inválido" });
        await store.update(cur.id, { estado: b.estado, actualizado: new Date().toISOString() });
      }
      if (b.notas !== undefined)
        await store.update(cur.id, { notas: clean(b.notas, 2000), actualizado: new Date().toISOString() });
      return send(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && parts[2] === "cotizaciones" && parts[3]) {
      await store.remove(parts[3]);
      return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: "No encontrado" });
}

/* ---------- archivos estáticos (lista blanca) ---------- */
const STATIC = new Set(["index.html", "styles.css", "app.js", "pricing.js", "qr.html", "admin.html"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const ok = STATIC.has(p) || /^assets\/[\w.-]+$/.test(p);
  const file = path.join(__dirname, p);
  if (!ok || !file.startsWith(__dirname) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const type = TYPES[ext] || "application/octet-stream";
  const range = req.headers.range; // necesario para que el video funcione en Safari/iOS
  if (range && ext === ".mp4") {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    "Cache-Control": [".png", ".mp4", ".webm", ".jpg"].includes(ext) ? "public, max-age=300" : "no-cache" });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e.message);
    send(res, /Supabase/.test(e.message) ? 502 : 400, { error: /Supabase/.test(e.message) ? "Error de base de datos" : "Solicitud inválida" });
  }
}).listen(PORT, () => console.log(`Cotizador en http://localhost:${PORT}  ·  Panel: http://localhost:${PORT}/admin.html`));
