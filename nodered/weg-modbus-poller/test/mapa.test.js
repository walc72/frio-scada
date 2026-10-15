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
