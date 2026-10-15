'use strict';
const { TRAMOS_EVENTOS, dirBloque, u32 } = require('./mapa');
const { leerTramos, REINTENTOS } = require('./lectura');
const connections = require('./connections');

const MAX = 20;

// Evento k (0 = mas nuevo) del bloque v2
function evento(m, k) {
  const w = [];
  for (let x = 0; x < 18; x++) w.push(m[dirBloque(3 + 18 * k + x)]);
  let texto = '';
  fin: for (const v of w.slice(3)) {
    for (const c of [v & 0xFF, v >> 8]) {
      if (c === 0) break fin;
      texto += String.fromCharCode(c);
    }
  }
  return { hora: w[0] + w[1] * 65536, estado: w[2], texto };
}

// Eventos registrados desde totalAnterior, del mas viejo al mas nuevo.
// - totalAnterior null (arranque): ninguno, no se re-registra el historial viejo.
// - total < totalAnterior: el PLC se reinicio; se toman todos los publicados, sin "perdidos".
// - mas de 20 nuevos: se devuelven los 20 publicados y el resto cuenta como perdidos.
function nuevosEventos(regs, totalAnterior) {
  const total = u32(regs, 321);
  const publicados = Math.min(regs[323], MAX);
  let n = 0, perdidos = 0;
  if (totalAnterior !== null && totalAnterior !== undefined) {
    if (total < totalAnterior) n = publicados;
    else {
      const nuevos = total - totalAnterior;
      n = Math.min(nuevos, publicados);
      perdidos = nuevos - n;
    }
  }
  const eventos = [];
  for (let k = n - 1; k >= 0; k--) eventos.push(evento(regs, k));
  return { eventos, perdidos, total };
}

/**
 * Lee el bloque de eventos (tramos 320..687).
 * Devuelve un arreglo de ULTIMO+1 registros con SOLO 320..687 llenos (el resto en 0): sirve tal cual
 * para nuevosEventos(); si se necesita junto al mapa, hay que mezclarlo con el resultado de leerMapa.
 * null si no se pudo leer sano.
 */
// Los tramos son consultas separadas: si EV_TOTAL (321..322) cambió mientras se leían, el bloque puede
// mezclar dos publicaciones. Se relee EV_TOTAL al final y, si cambió, se lee todo de nuevo.
async function leerEventos(dev) {
  for (let i = 0; i <= REINTENTOS; i++) {
    const r = await leerTramos(dev, TRAMOS_EVENTOS, false);
    if (r.error === 'sin-conexion') return null;
    if (!r.regs) continue;
    const t = await connections.poll(dev.ip, dev.port, dev.unitId, 321, 2);
    if (!t || t.length !== 2) return null;
    if (t[0] === r.regs[321] && t[1] === r.regs[322]) return r.regs;
  }
  return null;
}

module.exports = { nuevosEventos, leerEventos };
