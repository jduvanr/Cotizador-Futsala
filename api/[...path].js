/* Función de Vercel: atiende todo /api/* */
const { handle } = require("../lib/core.js");

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean);
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const ip = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || "?";
    const r = await handle({ method: req.method, parts, body, headers: req.headers, ip });
    res.statusCode = r.code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
    res.end(JSON.stringify(r.body));
  } catch (e) {
    console.error(e.message);
    res.statusCode = /Supabase/.test(e.message) ? 502 : 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: res.statusCode === 502 ? "Error de base de datos" : "Solicitud inválida" }));
  }
};
