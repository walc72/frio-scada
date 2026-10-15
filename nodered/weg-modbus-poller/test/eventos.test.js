'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const connections = require('../src/connections');
const { nuevosEventos, leerEventos } = require('../src/eventos');
const { dirBloque } = require('../src/mapa');
const fixture = require('./fixtures/mapa-v2.json');

// registros con `total` publicado y `n` eventos; el evento k (0 = mas nuevo) tiene hora 1000-k
function regs(total, n) {
  const m = new Array(688).fill(0);
  m[321] = total & 0xFFFF; m[322] = total >>> 16; m[323] = n;
  for (let k = 0; k < n; k++) {
    m[dirBloque(3 + 18 * k)] = 1000 - k;
    m[dirBloque(3 + 18 * k + 2)] = 1;
    m[dirBloque(3 + 18 * k + 3)] = 0x41 + k;   // texto "A"+k
  }
  return m;
}
const horas = (r) => r.eventos.map((e) => e.hora);

test('3 nuevos de 100 a 103', () => {
  const r = nuevosEventos(regs(103, 20), 100);
  assert.equal(r.eventos.length, 3);
  assert.equal(r.perdidos, 0);
  assert.equal(r.total, 103);
  assert.deepStrictEqual(horas(r), [998, 999, 1000]); // cronologico: del mas viejo al mas nuevo
  assert.equal(r.eventos[2].texto, 'A');
  assert.equal(r.eventos[2].estado, 1);
});

test('30 nuevos con 20 publicados: 20 eventos y 10 perdidos', () => {
  const r = nuevosEventos(regs(130, 20), 100);
  assert.equal(r.eventos.length, 20);
  assert.equal(r.perdidos, 10);
});

test('arranque (totalAnterior null): ninguno, pero informa el total', () => {
  const r = nuevosEventos(regs(130, 20), null);
  assert.deepStrictEqual(r, { eventos: [], perdidos: 0, total: 130 });
});

test('sin cambios', () => {
  assert.equal(nuevosEventos(regs(100, 20), 100).eventos.length, 0);
});

// Review focus 2: el total baja -> reinicio del PLC
test('total 12 con anterior 500: reinicio, devuelve los 12 publicados sin perdidos', () => {
  const r = nuevosEventos(regs(12, 12), 500);
  assert.equal(r.eventos.length, 12);
  assert.equal(r.perdidos, 0);
  assert.equal(r.total, 12);
});

test('reinicio con 20 publicados devuelve 20', () => {
  assert.equal(nuevosEventos(regs(800, 20), 900).eventos.length, 20);
});

test('coincide con los eventos decodificados por Python', () => {
  for (const e of fixture) {
    const total = e.regs[321] + e.regs[322] * 65536;
    const r = nuevosEventos(e.regs, total - e.eventos.length);
    assert.deepStrictEqual(r.eventos, [...e.eventos].reverse());
  }
});

test('leerEventos: poll null -> null; sana -> regs', async (t) => {
  t.mock.method(connections, 'poll', async () => null);
  assert.equal(await leerEventos({ ip: 'x', port: 502, unitId: 1 }), null);
});

test('leerEventos: lectura sana devuelve el arreglo con el bloque en su lugar', async (t) => {
  const e = fixture.find((x) => x.eventos.length === 20);
  t.mock.method(connections, 'poll', async (ip, p, u, ini, count) => e.regs.slice(ini, ini + count));
  const r = await leerEventos({ ip: 'x', port: 502, unitId: 1 });
  assert.equal(r.length, 688);
  assert.deepStrictEqual(r.slice(320), e.regs.slice(320));
});

test('leerEventos: EV_TOTAL cambia durante la lectura -> relee el bloque; siempre cambiando -> null', async (t) => {
  const e = fixture.find((x) => x.eventos.length === 20);
  let lecturasTotal = 0;
  t.mock.method(connections, 'poll', async (ip, p, u, ini, count) => {
    if (ini === 321 && count === 2) return lecturasTotal++ === 0 ? [e.regs[321] + 1, e.regs[322]] : e.regs.slice(321, 323);
    return e.regs.slice(ini, ini + count);
  });
  const r = await leerEventos({ ip: 'x', port: 502, unitId: 1 });
  assert.equal(lecturasTotal, 2);
  assert.deepStrictEqual(r.slice(320), e.regs.slice(320));
  t.mock.method(connections, 'poll', async (ip, p, u, ini, count) => (ini === 321 && count === 2 ? [0, 0] : e.regs.slice(ini, ini + count)));
  assert.equal(await leerEventos({ ip: 'x', port: 502, unitId: 1 }), null);
});
