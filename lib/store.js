/* Almacenamiento: Supabase si hay credenciales; SQLite local solo para desarrollo (no existe en Vercel). */
const fs = require("node:fs");
const path = require("node:path");

const _raw = (process.env.SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "");
const SB_URL = (() => { try { return new URL(_raw).origin; } catch { return ""; } })();
const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const TABLE = process.env.SUPABASE_TABLE || "cotizaciones";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "cotizaciones.db");

function sqliteStore() {
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS cotizaciones (
    id TEXT PRIMARY KEY, creado TEXT NOT NULL, actualizado TEXT NOT NULL, evento TEXT NOT NULL, organizador TEXT NOT NULL,
    telefono TEXT NOT NULL, fecha TEXT NOT NULL, lugar TEXT NOT NULL, deporte TEXT NOT NULL DEFAULT 'Fútbol de salón', partidos TEXT NOT NULL, camaras TEXT NOT NULL,
    sin_servicios TEXT NOT NULL DEFAULT '', valor_base REAL NOT NULL, valor_cotizado REAL NOT NULL,
    siguio_redes INTEGER NOT NULL DEFAULT 0, valor_final REAL NOT NULL, contacto_whatsapp INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'nuevo', notas TEXT NOT NULL DEFAULT '')`);
  try { db.exec("ALTER TABLE cotizaciones ADD COLUMN deporte TEXT NOT NULL DEFAULT 'Fútbol de salón'"); } catch (e) { /* ya existe */ }
  const out = r => r && { ...r, siguio_redes: !!r.siguio_redes, contacto_whatsapp: !!r.contacto_whatsapp };
  const COLS = new Set(["evento", "organizador", "telefono", "fecha", "lugar", "deporte", "partidos", "camaras", "sin_servicios", "valor_base", "valor_cotizado", "siguio_redes", "valor_final", "contacto_whatsapp", "estado", "notas", "actualizado"]);
  const val = v => (typeof v === "boolean" ? +v : v);
  return {
    name: "SQLite (" + DB_PATH + ")",
    async insert(r) {
      const k = Object.keys(r);
      db.prepare(`INSERT INTO cotizaciones (${k.join(",")}) VALUES (${k.map(() => "?").join(",")})`).run(...k.map(c => val(r[c])));
    },
    async get(id) { return out(db.prepare("SELECT * FROM cotizaciones WHERE id=?").get(id)); },
    async update(id, f) {
      const k = Object.keys(f).filter(c => COLS.has(c));
      db.prepare(`UPDATE cotizaciones SET ${k.map(c => c + "=?").join(",")} WHERE id=?`).run(...k.map(c => val(f[c])), id);
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
    if (!r.ok) throw new Error("Supabase " + r.status + " [" + url + "]: " + (await r.text()).slice(0, 300));
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

let cached;
function getStore() {
  if (cached) return cached;
  if (SB_URL && SB_KEY) cached = supabaseStore();
  else if (process.env.VERCEL) throw new Error("Supabase: faltan SUPABASE_URL y SUPABASE_SERVICE_KEY");
  else cached = sqliteStore();
  return cached;
}
module.exports = { getStore };
