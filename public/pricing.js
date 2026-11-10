/* Precios y cálculo — compartido entre el navegador y el servidor. Edita aquí los valores. */
(function (root) {
  // Orden de columnas: [1 cámara, 2 cámaras, 3 cámaras, celular]
  const TARIFAS = {
    porPartido: [180000, 200000, 240000, 100000], // hasta 5 partidos
    despuesDe5: [160000, 180000, 220000, 80000],  // partido #6 en adelante
    paquete3:   [550000, 570000, 650000, 400000],
    paquete4:   [650000, 670000, 750000, 500000],
    torneo16:   [3600000, 3620000, 3700000, 3000000],
    torneo12:   [3000000, 3020000, 3100000, 2500000],
  };

  const CAMARAS = [
    { id: 0, titulo: "1 cámara",  desc: "Transmisión sencilla",         icon: "📹" },
    { id: 1, titulo: "2 cámaras", desc: "Más ángulos y mejor show",     icon: "🎥" },
    { id: 2, titulo: "3 cámaras", desc: "Producción completa",          icon: "🎬" },
    { id: 3, titulo: "Celular",   desc: "Transmisión desde el celular", icon: "📱" },
  ];

  const PARTIDOS = [
    { id: "p3", icon: "⚽", titulo: "3 partidos", desc: "Cruzados, Final", precio: c => TARIFAS.paquete3[c] },
    { id: "p4", icon: "⚽", titulo: "4 partidos", desc: "Cruzados, 3 y 4, Final", precio: c => TARIFAS.paquete4[c] },
    // Sin paquete en la tabla: 5 a tarifa normal + 2 a tarifa "después de 5"
    { id: "p7", icon: "⚽", titulo: "7 partidos", desc: "Súbitas, Cruzados y Final",
      precio: c => 5 * TARIFAS.porPartido[c] + 2 * TARIFAS.despuesDe5[c] },
    { id: "t16", icon: "🏆", titulo: "Torneo 16 equipos", desc: "Torneo completo", precio: c => TARIFAS.torneo16[c] },
    { id: "t12", icon: "🏆", titulo: "Torneo 12 equipos", desc: "Torneo completo", precio: c => TARIFAS.torneo12[c] },
  ];

  const EXTRAS = [
    { id: "narrador",     icon: "🎙️", titulo: "Sin narrador" },
    { id: "comentarista", icon: "🗣️", titulo: "Sin comentarista" },
    { id: "sonido",       icon: "🔊", titulo: "Sin sonido" },
  ];

  const DESCUENTO_SERVICIO = 0.20; // por cada servicio que NO incluya
  const DESCUENTO_REDES = 50000;   // valor fijo en pesos por seguirnos en YouTube

  // Devuelve null si los datos no son válidos
  function calcular(partidosId, camarasId, extrasIds, siguioRedes) {
    const p = PARTIDOS.find(x => x.id === partidosId);
    const cam = CAMARAS[Number(camarasId)];
    if (!p || !cam) return null;
    const extras = [...new Set(extrasIds || [])].filter(id => EXTRAS.some(e => e.id === id));
    const base = p.precio(cam.id);
    const descExtras = base * DESCUENTO_SERVICIO * extras.length;
    const subtotal = base - descExtras;
    const descRedes = siguioRedes ? Math.min(DESCUENTO_REDES, subtotal) : 0;
    return { p, cam, extras, base, descExtras, subtotal, descRedes, total: subtotal - descRedes };
  }

  const api = { TARIFAS, CAMARAS, PARTIDOS, EXTRAS, DESCUENTO_SERVICIO, DESCUENTO_REDES, calcular };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PRICING = api;
})(typeof window !== "undefined" ? window : globalThis);
