'use strict';
// Lectura de SOLO LECTURA (FC03) del mapa v2 por tramos, descartando lecturas partidas.
const connections = require('./connections');
const { ULTIMO, VERSIONES, LARGO_CAMARA, TRAMOS, tramoValido } = require('./mapa');

const REINTENTOS = 3;

// Un intento: lee los tramos y devuelve {regs} o {error}. Nunca reutiliza tramos de otro intento.
// La marca se valida SOLO dentro de cada tramo (primera == ultima, no cero), como el registrador Python:
// el latido avanza en cada scan y cada tramo es una consulta aparte, asi que entre tramos la marca cambia.
async function leerTramos({ ip, port, unitId }, tramos, comprobarMapa) {
  const regs = new Array(ULTIMO + 1).fill(0);
  for (const [ini, fin] of tramos) {
    const r = await connections.poll(ip, port, unitId, ini, fin - ini + 1);
    if (!r || r.length !== fin - ini + 1) return { error: 'sin-conexion' };
    if (!tramoValido(r)) return { error: 'partida' };
    for (let i = 0; i < r.length; i++) regs[ini + i] = r[i];
    if (comprobarMapa && ini === 0) {
      if (!VERSIONES.includes(r[1])) return { error: 'version', version: r[1] };
      if (r[2] !== LARGO_CAMARA) return { error: 'largo', largo: r[2], version: r[1] };
    }
  }
  return { regs };
}

async function leerMapa(dev) {
  let r;
  for (let i = 0; i <= REINTENTOS; i++) {
    r = await leerTramos(dev, TRAMOS, true);
    if (r.error !== 'partida') return r;
  }
  return r;
}

module.exports = { leerMapa, leerTramos, REINTENTOS };
