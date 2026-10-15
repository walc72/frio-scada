'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { crearServidor } = require('./servidorFalso');
const fixtures = require('./fixtures/mapa-v2.json');
const connections = require('../src/connections');
const { leerMapa } = require('../src/lectura');
const { leerEventos, nuevosEventos } = require('../src/eventos');
const { decodificar } = require('../src/mapa');
const { createComunicacion } = require('../src/comunicacion');
const { createCiclo } = require('../src/ciclo');
const { diff } = require('../src/cambios');
const S = require('../src/salidaInflux');

const N = 30, CORTE = 10, PARTIDA = 20;

test('30 ciclos contra servidor Modbus falso: corte de 3 ciclos y un tramo partido', async () => {
  const srv = await crearServidor(fixtures, { cortarEn: CORTE, partirEn: PARTIDA });
  const plc = { ip: '127.0.0.1', port: srv.port, unitId: 1 };
  let t = 1700000000000, ts = t;
  const errores = [], escrito = [], estadosMqtt = [];
  const com = createComunicacion(() => t);
  const ciclo = createCiclo({
    plc, now: () => ts, fotoIntervalMs: 1e12, log: { error() {} },
    leerMapa: async (d) => { const r = await leerMapa(d); if (r.error) errores.push(r.error); return r; },
    leerEventos, decodificar, nuevosEventos, com,
    escribir: async (l) => escrito.push(l),
    mqtt: { estado() {}, latido: (_t, c) => estadosMqtt.push(c), evento() {} },
  });
  try {
    for (let n = 0; n < N; n++) {
      srv.ciclo = n; t += 1000; ts = t;
      await ciclo(); await ciclo.vaciar();
    }
  } finally { connections.closeAll(); await srv.close(); }

  assert.deepStrictEqual(errores, ['sin-conexion', 'sin-conexion', 'sin-conexion', 'partida']);
  assert.strictEqual(com.estado().descartadas, 1);
  // latido en cada ciclo; _conectado = estado de la comunicación (caído recién a la 3ª falla seguida: ciclo 12)
  assert.strictEqual(estadosMqtt.length, N);
  assert.deepStrictEqual(estadosMqtt.flatMap((c, n) => (c ? [] : [n])), [12]);

  // Esperado: diff solo entre lecturas válidas (ciclos 0-9, 13-19, 21-29); el corte y la partida no inventan datos.
  const malos = new Set([10, 11, 12, 20]);
  const esperado = [];
  let prev = null;
  for (let n = 0; n < N; n++) {
    if (malos.has(n)) continue;
    const e = decodificar(fixtures[n].regs);
    esperado.push(...S.lineasCambios(diff(prev, e), 1700000000000 + (n + 1) * 1000));
    prev = e;
  }
  const reales = escrito.join('\n').split('\n').filter((l) => l.startsWith('estado,'));
  assert.deepStrictEqual(reales, esperado);
  assert.ok(reales.length > 0);
  // el corte no es trivial: los mapas válidos a ambos lados difieren
  assert.ok(Object.keys(diff(decodificar(fixtures[9].regs), decodificar(fixtures[13].regs))).length > 0);
});

test('corte de transporte real (sockets destruidos, puerto cerrado): reconecta sin inventar cambios', async () => {
  connections.config.cooldownMs = 50;
  const srv = await crearServidor(fixtures);
  const plc = { ip: '127.0.0.1', port: srv.port, unitId: 1 };
  let ts = 1700000000000;
  const errores = [], escrito = [];
  const com = createComunicacion(() => ts);
  const ciclo = createCiclo({
    plc, now: () => ts, fotoIntervalMs: 1e12, log: { error() {} },
    leerMapa: async (d) => { const r = await leerMapa(d); if (r.error) errores.push(r.error); return r; },
    leerEventos, decodificar, nuevosEventos, com,
    escribir: async (l) => escrito.push(l),
    mqtt: { estado() {}, latido() {}, evento() {} },
  });
  const correr = async (n) => { srv.ciclo = n; ts += 1000; await ciclo(); await ciclo.vaciar(); };
  try {
    for (let n = 0; n < 5; n++) await correr(n);
    await srv.caer();
    for (let n = 5; n < 8; n++) await correr(n);
    assert.deepStrictEqual(errores, ['sin-conexion', 'sin-conexion', 'sin-conexion']);
    const antes = escrito.length;
    await srv.volver();
    await new Promise((r) => setTimeout(r, 100)); // pasa el enfriamiento de reconexión
    await correr(8);
    assert.strictEqual(errores.length, 3); // la lectura posterior al corte fue válida
    const nuevas = escrito.slice(antes).join('\n').split('\n').filter((l) => l.startsWith('estado,'));
    const esperado = S.lineasCambios(diff(decodificar(fixtures[4].regs), decodificar(fixtures[8].regs)), ts);
    assert.ok(esperado.length > 0);
    assert.deepStrictEqual(nuevas, esperado);
  } finally { connections.config.cooldownMs = 6000; connections.closeAll(); await srv.close(); }
});
