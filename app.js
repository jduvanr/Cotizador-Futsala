/* ============================================================
   CONFIGURACIÓN — redes y WhatsApp (los precios están en pricing.js)
   ============================================================ */
const CONFIG = {
  whatsapp: "573123364028", // sin + ni espacios
  fechaMax: "2028-12-31",
    redes: [
    { id: "yt", icon: "▶️", nombre: "YouTube", url: "https://www.youtube.com/channel/UCYCgGBhseQMEd6syQqsbveQ" },
  ],
};

const { PARTIDOS, CAMARAS, EXTRAS, calcular } = PRICING;

/* ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => "$" + Math.round(n).toLocaleString("es-CO");

const state = { step: 0, partidos: null, camaras: null, extras: new Set(), visited: new Set(), siguio: false, id: null };
const TOTAL_STEPS = 6;

/* ---------- navegación ---------- */
function go(n) {
  state.step = n;
  $$(".screen").forEach(s => s.classList.toggle("active", +s.dataset.step === n));
  $("#progressBar").style.width = (n / TOTAL_STEPS * 100) + "%";
  if (n === 5) renderQuote();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-go]").forEach(b => b.addEventListener("click", () => go(+b.dataset.go)));
$$("[data-back]").forEach(b => b.addEventListener("click", () => go(Math.max(0, state.step - 1))));

/* ---------- video hero ---------- */
const video = $("#heroVideo");
const heroEl = $(".hero");
$("source", video).addEventListener("error", () => heroEl.classList.add("hero--novideo"));
video.addEventListener("error", () => heroEl.classList.add("hero--novideo"));
video.play && video.play().catch(() => {});

/* ---------- paso 1: datos ---------- */
// Teléfono: solo dígitos, máx. 10 (también limpia pegados como "+57 312 336 4028")
$("#evTel").addEventListener("input", e => {
  let v = e.target.value.replace(/\D/g, "");
  if (v.length > 10 && v.startsWith("57")) v = v.slice(2);
  e.target.value = v.slice(0, 10);
});
const pad = n => String(n).padStart(2, "0");
const t = new Date(); t.setDate(t.getDate() + 1); // solo fechas posteriores a hoy
const manana = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
$("#evFecha").min = manana;
$("#evFecha").max = CONFIG.fechaMax;

function datosEvento() {
  return {
    evento: $("#evNombre").value.trim(),
    organizador: $("#evOrg").value.trim(),
    telefono: $("#evTel").value.trim(),
    fecha: $("#evFecha").value,
    lugar: $("#evLugar").value.trim(),
  };
}
$("#next1").addEventListener("click", () => {
  const err = $("#err1"), d = datosEvento();
  const fail = (msg, id) => { err.textContent = msg; $(id).focus(); };
  if (!d.evento) return fail("Escribe el nombre del evento.", "#evNombre");
  if (!d.organizador) return fail("Escribe el nombre del organizador.", "#evOrg");
  if (!/^3\d{9}$/.test(d.telefono)) return fail("Escribe un celular válido de 10 dígitos que empiece por 3 (ej: 3123364028).", "#evTel");
  if (!d.fecha) return fail("Elige una fecha estimada.", "#evFecha");
  if (d.fecha < manana || d.fecha > CONFIG.fechaMax) return fail("Elige una fecha desde mañana y hasta el 31 de diciembre de 2028.", "#evFecha");
  if (!d.lugar) return fail("Escribe dónde se realizará.", "#evLugar");
  err.textContent = "";
  go(2);
});

/* ---------- opciones (paso 2, 3, 4) ---------- */
function optionHTML(o, desc) {
  return `<button type="button" class="opt" data-id="${o.id}">
    <span class="opt__icon">${o.icon}</span>
    <span class="opt__body"><span class="opt__title">${o.titulo}</span>${desc ? `<span class="opt__desc" style="display:block">${desc}</span>` : ""}</span>
    <span class="opt__check">✓</span></button>`;
}
$("#optPartidos").innerHTML = PARTIDOS.map(p => optionHTML(p, p.desc)).join("");
$("#optCamaras").innerHTML = CAMARAS.map(c => optionHTML(c, c.desc)).join("");

function singleSelect(containerSel, key, btnSel) {
  const box = $(containerSel);
  box.addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b) return;
    $$(".opt", box).forEach(x => x.classList.toggle("selected", x === b));
    state[key] = b.dataset.id;
    $(btnSel).disabled = false;
  });
}
singleSelect("#optPartidos", "partidos", "#next2");
singleSelect("#optCamaras", "camaras", "#next3");
$("#next2").addEventListener("click", () => go(3));
$("#next3").addEventListener("click", () => go(4));

$("#next4").addEventListener("click", () => go(5));

/* ---------- cálculo y resultado ---------- */
const quote = () => calcular(state.partidos, state.camaras, [...state.extras], state.siguio);

function fechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

/* ---------- base de datos ---------- */
async function guardarCotizacion() {
  if (state.id) return; // ya guardada
  try {
    const r = await fetch("/api/cotizaciones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datosEvento(), partidos: state.partidos, camaras: state.camaras, extras: [...state.extras] }),
    });
    if (r.ok) state.id = (await r.json()).id;
  } catch (e) { /* si falla el guardado, el cliente puede seguir cotizando */ }
}
async function actualizarCotizacion(cambios) {
  if (!state.id) return;
  try { await fetch("/api/cotizaciones/" + state.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) }); } catch (e) {}
}

function renderQuote() {
  const ev = datosEvento(), c = quote();
  $("#qEvento").textContent = ev.evento;
  const rows = [
    ["Organizador", ev.organizador],
    ["Fecha estimada", fechaLarga(ev.fecha)],
    ["Lugar", ev.lugar],
    ["Partidos", c.p.titulo],
    ["Transmisión", c.cam.titulo],
    ["Valor base", fmt(c.base)],
  ];
  const esc = s => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  let html = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  c.extras.forEach(id => {
    const e = EXTRAS.find(x => x.id === id);
    html += `<div class="neg"><dt>${e.titulo}</dt><dd>− ${fmt(c.base * PRICING.DESCUENTO_SERVICIO)}</dd></div>`;
  });
  $("#qList").innerHTML = html;
  $("#qTotal").textContent = fmt(c.total);
  const inc = [
    ["narrador", "🎙️", "Narración"], ["comentarista", "🗣️", "Comentarista"],
    ["pantalla", "📺", "Pauta en pantalla de tus patrocinadores"], ["sonido", "🔊", "2 cabinas de sonido que se amplía en todo el lugar"],
    ["transmision", "📡", `Transmisión en ${c.cam.titulo.toLowerCase()} · ${c.p.titulo}`],
  ].filter(([id]) => !c.extras.includes(id));
  $("#qIncluye").innerHTML = inc.map(([, ic, t]) => `<li><b>${ic}</b> ${t}</li>`).join("");
  guardarCotizacion();
}
$("#next5").addEventListener("click", () => go(6));

/* ---------- redes + descuento + WhatsApp ---------- */
const socialsBox = $("#socials");
socialsBox.innerHTML = CONFIG.redes.map(r => `
  <a class="social" data-n="${r.id}" href="${r.url}" target="_blank" rel="noopener">
    <span class="social__ic">${r.icon}</span><span>Suscribirme en ${r.nombre}</span>
    <span class="social__go">Abrir →</span></a>`).join("");

socialsBox.addEventListener("click", e => {
  const a = e.target.closest(".social"); if (!a) return;
  a.classList.add("done");
  $(".social__go", a).textContent = "✓ Listo";
  state.visited.add(a.dataset.n);
  if (state.visited.size >= CONFIG.redes.length && !state.siguio) unlock();
});

function waMessage() {
  const ev = datosEvento(), c = quote();
  const omitidos = c.extras.map(id => EXTRAS.find(x => x.id === id).titulo).join(", ") || "Ninguno";
  return [
    "Hola futsala.co 👋 quiero cotizar mi evento:",
    "",
    `*Evento:* ${ev.evento}`,
    `*Organizador:* ${ev.organizador}`,
    `*Teléfono:* ${ev.telefono}`,
    `*Fecha estimada:* ${fechaLarga(ev.fecha)}`,
    `*Lugar:* ${ev.lugar}`,
    `*Partidos:* ${c.p.titulo} (${c.p.desc})`,
    `*Transmisión:* ${c.cam.titulo}`,
    `*Servicios omitidos:* ${omitidos}`,
    `*Valor con descuento por seguirnos:* ${fmt(c.total)}`,
  ].join("\n");
}
function unlock() {
  state.siguio = true;
  const c = quote();
  $("#qTotalDesc").textContent = fmt(c.total);
  $("#qWas").textContent = `Antes ${fmt(c.subtotal)} · ahorras ${fmt(c.descRedes)}`;
  $("#discountBox").hidden = false;
  const b = $("#waBtn");
  b.classList.remove("is-locked");
  b.removeAttribute("aria-disabled");
  b.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(waMessage())}`;
  $("#socialHint").textContent = "¡Gracias por seguirnos! Descuento aplicado. Ya puedes contactarnos.";
  actualizarCotizacion({ siguio_redes: true });
}
$("#waBtn").addEventListener("click", () => actualizarCotizacion({ contacto_whatsapp: true }));

$("#restart").addEventListener("click", () => {
  Object.assign(state, { partidos: null, camaras: null, visited: new Set(), siguio: false, id: null });
  state.extras.clear();
  $$(".opt.selected").forEach(x => x.classList.remove("selected"));
  $("#next2").disabled = $("#next3").disabled = true;
  $$(".social").forEach(a => { a.classList.remove("done"); $(".social__go", a).textContent = "Abrir →"; });
  $("#waBtn").classList.add("is-locked"); $("#waBtn").href = "#";
  $("#discountBox").hidden = true;
  $("#socialHint").textContent = "Abre cada red. Se marcará cuando la hayas visitado.";
  $("#formEvento").reset();
  go(0);
});

go(0);
