/* Lógica de la API, compartida por el servidor local (server.js) y la función de Vercel (api/[...path].js). */
const crypto = require("node:crypto");
const P = require("../public/pricing.js");
const { getStore } = require("./store.js");

const MAX_DATE = "2028-12-31";
const ESTADOS = ["nuevo", "contactado", "negociando", "cerrado", "perdido"];
// En Vercel NO hay clave por defecto: si falta ADMIN_PASSWORD el panel queda deshabilitado.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? "" : "futsala2026");

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const hits = new Map(); // límite por IP (en Vercel es por instancia: freno básico)
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3_600_000);
  arr.push(now); hits.set(ip, arr); return arr.length > 30;
}
function isAdmin(headers) {
  if (!ADMIN_PASSWORD) return false;
  const h = headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const pass = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = crypto.createHash("sha256").update(pass).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const ok = (body, code = 200) => ({ code, body });
const err = (code, msg, headers) => ({ code, body: { error: msg }, headers });

/* parts: ["api","cotizaciones",id?] · body: objeto JSON · devuelve { code, body, headers? } */
async function handle({ method, parts, body, headers, ip }) {
  const store = getStore();
  const b = body && typeof body === "object" ? body : {};

  if (method === "POST" && parts[1] === "cotizaciones" && !parts[2]) {
    if (limited(ip)) return err(429, "Demasiadas solicitudes");
    const evento = clean(b.evento, 120), organizador = clean(b.organizador, 120),
          telefono = String(b.telefono ?? "").replace(/\D/g, ""), lugar = clean(b.lugar, 160), fecha = clean(b.fecha, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (!evento || !organizador || !lugar) return err(400, "Faltan datos del evento");
    if (!/^3\d{9}$/.test(telefono)) return err(400, "Teléfono inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha <= today || fecha > MAX_DATE) return err(400, "Fecha inválida");
    const q = P.calcular(b.deporte, b.partidos, b.camaras, b.extras, false);
    if (!q) return err(400, "Opciones inválidas");
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await store.insert({ id, creado: now, actualizado: now, evento, organizador, telefono, fecha, lugar,
      deporte: q.d.titulo, partidos: q.p.titulo, camaras: q.cam.titulo, sin_servicios: q.extras.join(", "),
      valor_base: q.base, valor_cotizado: q.subtotal, valor_final: q.subtotal });
    return ok({ id }, 201);
  }

  if (method === "PATCH" && parts[1] === "cotizaciones" && parts[2]) {
    const cur = await store.get(parts[2]);
    if (!cur) return err(404, "No existe");
    const siguio = !!(b.siguio_redes || cur.siguio_redes);
    const wa = !!(b.contacto_whatsapp || cur.contacto_whatsapp);
    const extras = cur.sin_servicios ? cur.sin_servicios.split(", ") : [];
    const did = (P.DEPORTES.find(x => x.titulo === cur.deporte) || P.DEPORTES[0]).id;
    const pid = P.PARTIDOS.find(x => x.titulo === cur.partidos).id;
    const cid = P.CAMARAS.find(x => x.titulo === cur.camaras).id;
    const q = P.calcular(did, pid, cid, extras, siguio);
    await store.update(cur.id, { siguio_redes: siguio, contacto_whatsapp: wa, valor_final: q.total, actualizado: new Date().toISOString() });
    return ok({ ok: true, total: q.total });
  }

  if (parts[1] === "admin") {
    if (!ADMIN_PASSWORD) return err(503, "Panel deshabilitado: define ADMIN_PASSWORD");
    if (!isAdmin(headers)) return err(401, "No autorizado", { "WWW-Authenticate": 'Basic realm="futsala admin"' });
    if (method === "GET" && parts[2] === "cotizaciones") return ok(await store.all());
    if (method === "PATCH" && parts[2] === "cotizaciones" && parts[3]) {
      const cur = await store.get(parts[3]);
      if (!cur) return err(404, "No existe");
      const upd = { actualizado: new Date().toISOString() };
      if (b.estado !== undefined) {
        if (!ESTADOS.includes(b.estado)) return err(400, "Estado inválido");
        upd.estado = b.estado;
      }
      if (b.notas !== undefined) upd.notas = clean(b.notas, 2000);
      await store.update(cur.id, upd);
      return ok({ ok: true });
    }
    if (method === "DELETE" && parts[2] === "cotizaciones" && parts[3]) {
      await store.remove(parts[3]);
      return ok({ ok: true });
    }
  }
  return err(404, "No encontrado");
}
module.exports = { handle };
