'use strict';
const test = require('node:test');
const assert = require('node:assert');
const s = require('../src/salidaInflux');

const ts = 1700000000000;
const ns = '1700000000000000000';

test('lineasCambios: grupo', () => {
  assert.deepStrictEqual(s.lineasCambios([{ campo: 'C5.G3.comp', antes: 0, ahora: 1 }], ts),
    [`estado,camara=C5,grupo=G3,campo=comp valor=1 ${ns}`]);
});
test('lineasCambios: sin grupo, general, texto y float', () => {
  const l = s.lineasCambios([
    { campo: 'C5.H1.estado', antes: 'a', ahora: 'ACTIVO "x"' },
    { campo: 'C4.modo', antes: 0, ahora: 2.5 },
    { campo: 'param.horas_max_manual', antes: 1, ahora: 8 },
    { campo: 'eventos_total', antes: 1, ahora: 2 },
  ], ts);
  assert.deepStrictEqual(l, [
    `estado,camara=C5,campo=H1.estado texto="ACTIVO \\"x\\"" ${ns}`,
    `estado,camara=C4,campo=modo valor=2.5 ${ns}`,
    `estado,camara=general,campo=param.horas_max_manual valor=8 ${ns}`,
    `estado,camara=general,campo=eventos_total valor=2 ${ns}`,
  ]);
});
test('lineaFoto', () => {
  assert.strictEqual(s.lineaFoto({ 'C5.modo': 'auto', 'C5.x': 3, hora_plc: '2026-01-01 00:00:00' }, ts),
    `foto C5.modo="auto",C5.x=3,hora_plc="2026-01-01 00:00:00" ${ns}`);
});
test('lineasEventos: ts distintos por evento', () => {
  const l = s.lineasEventos([{ hora: 5, estado: 1, texto: 'Falla, "A"' }, { hora: 6, estado: 0, texto: 'ok' }], ts);
  assert.deepStrictEqual(l, [
    `eventos texto="Falla, \\"A\\"",estado=1i,hora_plc=5i ${ns}`,
    `eventos texto="ok",estado=0i,hora_plc=6i 1700000000000000001`,
  ]);
});
test('lineaComunicacion', () => {
  assert.strictEqual(s.lineaComunicacion({ conectado: true, descartadas: 2, desvioRelojS: -150 }, ts),
    `comunicacion conectado=true,descartadas=2i,desvio_reloj_s=-150i ${ns}`);
  assert.strictEqual(s.lineaComunicacion({ conectado: false, descartadas: 0, desvioRelojS: null, eventosPerdidos: 3 }, ts),
    `comunicacion conectado=false,descartadas=0i,eventos_perdidos=3i ${ns}`);
});
test('numero entero (REAL 8) va como float sin sufijo y string desconocido como string', () => {
  assert.deepStrictEqual(s.lineasCambios([{ campo: 'param.horas_max_manual', antes: 7, ahora: 8 }, { campo: 'C5.G1.estado', antes: 'a', ahora: '99' }], ts),
    [`estado,camara=general,campo=param.horas_max_manual valor=8 ${ns}`, `estado,camara=C5,grupo=G1,campo=estado texto="99" ${ns}`]);
});
test('lineaComunicacion: lineas_descartadas y mapa_incompatible', () => {
  assert.match(s.lineaComunicacion({ conectado: false, descartadas: 0, lineasDescartadas: 4, mapaIncompatible: true }, ts), /lineas_descartadas=4i,mapa_incompatible=true /);
});
