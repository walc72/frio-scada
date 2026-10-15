'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const connections = require('../src/connections');
const { leerMapa } = require('../src/lectura');
const { TRAMOS } = require('../src/mapa');

const dev = { ip: '10.0.0.1', port: 502, unitId: 1 };

// Respuesta de un PLC simulado; marcas[i] = marca del tramo i; regs[1] = version
function plc({ marcas, version = 2, largo = 90 }) {
  return async (ip, port, unit, ini, count) => {
    const t = TRAMOS.findIndex(([a]) => a === ini);
    const r = new Array(count).fill(7);
    r[0] = r[count - 1] = marcas[t];
    if (ini === 0) { r[1] = version; r[2] = largo; }
    return r;
  };
}

test('lectura sana', async (t) => {
  t.mock.method(connections, 'poll', plc({ marcas: [5, 5, 5, 5] }));
  const r = await leerMapa(dev);
  assert.equal(r.regs.length, 688);
  assert.equal(r.regs[1], 2);
});

test('tramos con marcas distintas entre si pero sanas cada uno -> lectura valida (caso normal de planta)', async (t) => {
  t.mock.method(connections, 'poll', plc({ marcas: [5, 6, 7, 8] }));
  const r = await leerMapa(dev);
  assert.ok(r.regs);
  assert.deepStrictEqual([r.regs[0], r.regs[106], r.regs[197], r.regs[294]], [5, 6, 7, 8]);
});

test('marca de tramo no coincide con su par -> partida', async (t) => {
  t.mock.method(connections, 'poll', async (ip, p, u, ini, count) => {
    const r = new Array(count).fill(1);
    r[0] = 5; r[count - 1] = 4;
    return r;
  });
  assert.deepStrictEqual(await leerMapa(dev), { error: 'partida' });
});

test('version 1 -> error version', async (t) => {
  t.mock.method(connections, 'poll', plc({ marcas: [5, 5, 5, 5], version: 1 }));
  assert.deepStrictEqual(await leerMapa(dev), { error: 'version', version: 1 });
});

test('largo de bloque inesperado -> error largo', async (t) => {
  t.mock.method(connections, 'poll', plc({ marcas: [5, 5, 5, 5], largo: 80 }));
  assert.deepStrictEqual(await leerMapa(dev), { error: 'largo', largo: 80, version: 2 });
});

test('poll null -> sin-conexion', async (t) => {
  t.mock.method(connections, 'poll', async () => null);
  assert.deepStrictEqual(await leerMapa(dev), { error: 'sin-conexion' });
});

// Review focus 1 (corregido): un tramo con marca interna inconsistente es partida y no se mezcla con la lectura anterior
test('lectura 2 con un tramo partido en cada intento -> partida, sin datos de la lectura 1', async (t) => {
  const m = t.mock.method(connections, 'poll', plc({ marcas: [5, 5, 5, 5] }));
  const primera = await leerMapa(dev);
  assert.ok(primera.regs);
  m.mock.restore();
  const sana = plc({ marcas: [5, 5, 5, 5] });
  t.mock.method(connections, 'poll', async (ip, p, u, ini, count) => {
    const r = await sana(ip, p, u, ini, count);
    if (ini === 106) { r[0] = 6; r[count - 1] = 5; }   // reinicio a mitad de ese tramo
    return r;
  });
  const segunda = await leerMapa(dev);
  assert.deepStrictEqual(segunda, { error: 'partida' });
});

test('reintenta una lectura partida y acepta la siguiente sana', async (t) => {
  let n = 0;
  const sana = plc({ marcas: [5, 5, 5, 5] }), rota = async (...a) => { const r = await sana(...a); r[0] = 9; return r; };
  t.mock.method(connections, 'poll', (...a) => (n++ < 1 ? rota : sana)(...a));
  const r = await leerMapa(dev);
  assert.ok(r.regs);
});
