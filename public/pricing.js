/* Precios y cálculo — compartido entre el navegador y el servidor. Edita aquí los valores. */
(function (root) {
  const k = (...v) => v.map(n => n * 1000); // valores en miles de pesos

  // Orden de columnas en cada fila: [1 cámara, 2 cámaras, 3 cámaras, celular]
  const SALON_SALA = {
    porPartido:   k(180, 200, 240, 100), // hasta 5 partidos
    despuesDe5:   k(160, 180, 220, 80),  // partido #6 en adelante
    porPartidoT16: k(110, 130, 170, 30),
    porPartidoT12: k(120, 140, 180, 40),
    paquete3:     k(550, 570, 650, 400),
    paquete4:     k(650, 670, 750, 500),
    torneo16:     k(3600, 3620, 3700, 3000),
    torneo12:     k(3000, 3020, 3100, 2500),
  };
  // Fútbol 7 y Fútbol 8 tienen la misma tabla de precios
  const F7_F8 = {
    porPartido:   k(200, 220, 260, 120),
    despuesDe5:   k(200, 220, 260, 120),
    porPartidoT16: k(180, 200, 240, 100),
    porPartidoT12: k(150, 170, 210, 70),
    paquete3:     k(650, 670, 700, 400),
    paquete4:     k(800, 820, 890, 500),
    torneo16:     k(4500, 4520, 4800, 3000),
    torneo12:     k(4000, 4020, 4500, 2500),
  };
  const F11 = {
    porPartido:   k(250, 270, 310, 170),
    despuesDe5:   k(250, 270, 310, 170),
    porPartidoT16: k(200, 220, 260, 120),
    porPartidoT12: k(200, 220, 260, 120),
    paquete3:     k(1000, 1050, 1100, 600),
    paquete4:     k(1200, 1250, 1300, 800),
    torneo16:     k(6000, 6050, 6100, 3000),
    torneo12:     k(5000, 5200, 5400, 2500),
  };

  const DEPORTES = [
    { id: "salon", icon: "🥅", titulo: "Fútbol de salón", tarifas: SALON_SALA },
    { id: "sala",  icon: "⚽", titulo: "Fútbol sala",     tarifas: SALON_SALA },
    { id: "f7",    icon: "7️⃣", titulo: "Fútbol 7",        tarifas: F7_F8 },
    { id: "f8",    icon: "8️⃣", titulo: "Fútbol 8",        tarifas: F7_F8 },
    { id: "f11",   icon: "🏟️", titulo: "Fútbol 11",       tarifas: F11 },
  ];

  const CAMARAS = [
    { id: 0, titulo: "1 cámara",  desc: "Transmisión sencilla",         icon: "📹" },
    { id: 1, titulo: "2 cámaras", desc: "Más ángulos y mejor show",     icon: "🎥" },
    { id: 2, titulo: "3 cámaras", desc: "Producción completa",          icon: "🎬" },
    { id: 3, titulo: "Celular",   desc: "Transmisión desde el celular", icon: "📱" },
  ];

  // precio(columna, tarifasDelDeporte)
  const PARTIDOS = [
    { id: "p3", icon: "⚽", titulo: "3 partidos", desc: "Cruzados, Final", precio: (c, t) => t.paquete3[c] },
    { id: "p4", icon: "⚽", titulo: "4 partidos", desc: "Cruzados, 3 y 4, Final", precio: (c, t) => t.paquete4[c] },
    // Sin paquete en la tabla: 5 a tarifa normal + 2 a tarifa "después de 5"
    { id: "p7", icon: "⚽", titulo: "7 partidos", desc: "Súbitas, Cruzados y Final",
      precio: (c, t) => 5 * t.porPartido[c] + 2 * t.despuesDe5[c] },
    { id: "t16", icon: "🏆", titulo: "Torneo 16 equipos", desc: "Torneo completo", precio: (c, t) => t.torneo16[c] },
    { id: "t12", icon: "🏆", titulo: "Torneo 12 equipos", desc: "Torneo completo", precio: (c, t) => t.torneo12[c] },
  ];

  const EXTRAS = [
    { id: "narrador",     icon: "🎙️", titulo: "Sin narrador" },
    { id: "comentarista", icon: "🗣️", titulo: "Sin comentarista" },
    { id: "sonido",       icon: "🔊", titulo: "Sin sonido" },
  ];

  const DESCUENTO_SERVICIO = 0.20; // por cada servicio que NO incluya (hoy la pantalla no lo ofrece)
  const DESCUENTO_REDES = 50000;   // valor fijo en pesos por seguirnos en YouTube

  // Devuelve null si los datos no son válidos
  function calcular(deporteId, partidosId, camarasId, extrasIds, siguioRedes) {
    const d = DEPORTES.find(x => x.id === deporteId);
    const p = PARTIDOS.find(x => x.id === partidosId);
    const cam = CAMARAS[Number(camarasId)];
    if (!d || !p || !cam) return null;
    const extras = [...new Set(extrasIds || [])].filter(id => EXTRAS.some(e => e.id === id));
    const base = p.precio(cam.id, d.tarifas);
    const descExtras = base * DESCUENTO_SERVICIO * extras.length;
    const subtotal = base - descExtras;
    const descRedes = siguioRedes ? Math.min(DESCUENTO_REDES, subtotal) : 0;
    return { d, p, cam, extras, base, descExtras, subtotal, descRedes, total: subtotal - descRedes };
  }

  const api = { DEPORTES, CAMARAS, PARTIDOS, EXTRAS, DESCUENTO_SERVICIO, DESCUENTO_REDES, calcular };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PRICING = api;
})(typeof window !== "undefined" ? window : globalThis);
