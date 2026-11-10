/* Servidor LOCAL de desarrollo: sirve /public y /api con la misma lógica que Vercel.
   Uso: node server.js   ·   En producción (Vercel) no se usa: Vercel sirve /public y api/[...path].js
   Sin variables de Supabase usa SQLite local (data/cotizaciones.db). */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handle } = require("./lib/core.js");

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

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

function serveStatic(req, res, url) {
  const p = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
  const ext = path.extname(file).toLowerCase(), stat = fs.statSync(file), type = TYPES[ext] || "application/octet-stream";
  const range = req.headers.range;
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
    if (url.pathname.startsWith("/api/")) {
      const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readJson(req) : {};
      const ip = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "?";
      const r = await handle({ method: req.method, parts: url.pathname.split("/").filter(Boolean), body, headers: req.headers, ip });
      return send(res, r.code, r.body, "application/json; charset=utf-8", r.headers || {});
    }
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e.message);
    send(res, /Supabase/.test(e.message) ? 502 : 400, { error: /Supabase/.test(e.message) ? "Error de base de datos" : "Solicitud inválida" });
  }
}).listen(PORT, () => console.log(`Cotizador en http://localhost:${PORT}  ·  Panel: http://localhost:${PORT}/admin.html`));
