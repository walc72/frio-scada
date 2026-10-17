'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodificar } = require('../src/mapa');
const fixture = require('./fixtures/mapa-v2.json');

test('decodifica igual que Python', () => {
  assert.ok(fixture.length >= 30);
  fixture.forEach((e, i) => {
    assert.deepStrictEqual(decodificar(e.regs), e.decodificado, `entrada ${i}`);
  });
});

test('codigo desconocido se decodifica como string', () => {
  const regs = new Array(688).fill(0);
  regs[16] = 999;
  assert.strictEqual(decodificar(regs)['C5.modo'], '999');
});

test('C5 decodifica el HAB real del horario (habilitado_hmi, +29)', () => {
  const regs = new Array(688).fill(0);
  regs[1] = 2;
  regs[198 + 29] = 0b0101;   // C5: horarios 1 y 3
  regs[228 + 29] = 0b0010;   // C4: horario 2
  const d = decodificar(regs);
  assert.deepStrictEqual([1, 2, 3, 4].map(h => d[`C5.H${h}.habilitado_hmi`]), [1, 0, 1, 0]);
  assert.deepStrictEqual([1, 2, 3, 4].map(h => d[`C4.H${h}.habilitado_hmi`]), [0, 1, 0, 0]);
  assert.strictEqual(d['C5.G1.habilitado_hmi'], undefined);   // el de grupos (+28) sigue siendo solo C4
});
