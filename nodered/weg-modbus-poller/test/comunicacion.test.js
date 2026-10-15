'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createComunicacion } = require('../src/comunicacion');

function reloj(t0 = 1700000000000) { let t = t0; const f = () => t; f.avanza = (ms) => { t += ms; }; return f; }

test('3 fallas seguidas: desconectado desde la primera', () => {
  const now = reloj(); const c = createComunicacion(now);
  c.lecturaOk(1700000000);
  const t1 = now(); now.avanza(1000);
  c.lecturaFallida('sin-conexion'); assert.strictEqual(c.estado().conectado, true);
  const primera = t1 + 1000;
  now.avanza(1000); c.lecturaFallida('sin-conexion');
  now.avanza(1000); c.lecturaFallida('partida');
  const e = c.estado();
  assert.strictEqual(e.conectado, false);
  assert.strictEqual(e.desde, primera);
  assert.strictEqual(e.descartadas, 1);
  now.avanza(1000); c.lecturaOk(1700000000);
  assert.strictEqual(c.estado().conectado, true);
});
test('desvio de reloj: PLC 150 s atrasado', () => {
  const now = reloj(1700000000000); const c = createComunicacion(now);
  c.lecturaOk(1700000000 - 150);
  assert.strictEqual(c.estado().desvioRelojS, -150);
});
test('desvio contra el epoch de la PC (reloj UTC del PLC): no depende de la zona', () => {
  const now = reloj(1700000000000); const c = createComunicacion(now);
  c.lecturaOk(1700000000 + 10);
  assert.strictEqual(c.estado().desvioRelojS, 10);
  c.lecturaOk(NaN);
  assert.strictEqual(c.estado().desvioRelojS, 10);
});
