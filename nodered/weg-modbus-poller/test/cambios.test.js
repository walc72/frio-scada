'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { diff } = require('../src/cambios');

test('C5.G3.comp 0->1 da exactamente una entrada', () => {
  const r = diff({ 'C5.G3.comp': 0, a: 1 }, { 'C5.G3.comp': 1, a: 1 });
  assert.deepStrictEqual(r, [{ campo: 'C5.G3.comp', antes: 0, ahora: 1 }]);
});
test('excluye hora_plc, horas_marcha y horas_sin_desc', () => {
  const p = { hora_plc: 'a', 'C5.G1.horas_marcha': 1, 'C5.G1.horas_sin_desc': 1 };
  const n = { hora_plc: 'b', 'C5.G1.horas_marcha': 2, 'C5.G1.horas_sin_desc': 2 };
  assert.deepStrictEqual(diff(p, n), []);
});
test('prev null: todo es cambio (antes null)', () => {
  assert.deepStrictEqual(diff(null, { x: 2 }), [{ campo: 'x', antes: null, ahora: 2 }]);
});
