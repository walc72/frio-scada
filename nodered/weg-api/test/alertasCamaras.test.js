'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluar, desvioRelojS } = require('../src/services/alertasCamaras');

test('desvioRelojS: hora_plc local de planta (UTC-3, huso 0) -> 0; 5 min adelantado -> +300', () => {
  const ts = Date.parse('2026-10-15T15:00:00Z');
  const local = (s) => new Date(ts - 180 * 60000 + s * 1000).toISOString().slice(0, 19).replace('T', ' ');
  assert.equal(desvioRelojS({ _ts: ts, hora_plc: local(0), huso_min: 0 }), 0);
  assert.equal(desvioRelojS({ _ts: ts, hora_plc: local(300), huso_min: 0 }), 300);
});

const T0 = Date.parse('2026-10-15T15:00:00Z');
const MIN = 60000;
// hora_plc = hora local del PLC (UTC + huso_min), coherente con el reloj de la PC (sin desvío)
const HUSO = -180;
const horaPlc = (ms, extraS = 0) => new Date(ms + (HUSO * 60 + extraS) * 1000).toISOString().slice(0, 19).replace('T', ' ');
const est = (ts, flags = {}, extra = {}) => ({ _ts: ts, _conectado: true, hora_plc: horaPlc(ts), huso_min: HUSO, ...flags, ...extra });
const A = { 'C5.alarma_manual': 1 };

test('alarma nueva -> 1 aviso; 10 min después -> 0; 61 min -> 1; desaparece -> resuelto', () => {
  let r = evaluar(est(T0, A), T0, null);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /C5: alarma de manual prolongado/);
  r = evaluar(est(T0 + 10 * MIN, A), T0 + 10 * MIN, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(est(T0 + 61 * MIN, A), T0 + 61 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);
  r = evaluar(est(T0 + 62 * MIN), T0 + 62 * MIN, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(est(T0 + 63 * MIN), T0 + 63 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /^✅ resuelto: C5: alarma de manual prolongado/);
});

test('flags de grupo y horario llevan cámara y grupo/horario', () => {
  const r = evaluar(est(T0, { 'C5.G3.alarma_res': 1, 'C4.H1.solapado': 1 }), T0, null);
  assert.equal(r.avisos.length, 2);
  assert.ok(r.avisos.some((a) => a.includes('C5 G3')));
  assert.ok(r.avisos.some((a) => a.includes('C4 H1')));
});

test('PLC sin datos: 90 s -> 0, 130 s -> 1', () => {
  let r = evaluar(null, T0, null);
  assert.deepEqual(r.avisos, []);
  r = evaluar(null, T0 + 90000, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(null, T0 + 130000, r.memoria);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /sin comunicacion desde el arranque/);
});

test('estado viejo > 2 min -> aviso de comunicación con HH:MM de planta', () => {
  const r = evaluar(est(T0), T0 + 130000, null);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /PLC sin comunicacion desde 12:00/); // 15:00 UTC = 12:00 en planta (UTC-3)
  assert.equal(evaluar(est(T0), T0 + 90000, null).avisos.length, 0);
});

test('un ciclo fallido suelto (_conectado=false) -> 0 avisos; recién a los 2 min sin ciclo bueno', () => {
  let r = evaluar(est(T0), T0, null);
  r = evaluar({ ...est(T0 + 5000), _conectado: false }, T0 + 5000, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar({ ...est(T0 + 110000), _conectado: false }, T0 + 110000, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar({ ...est(T0 + 125000), _conectado: false }, T0 + 125000, r.memoria);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /PLC sin comunicacion desde 12:00/);
});

test('API reiniciada durante el corte: sin un _conectado true conocido -> "desde el arranque", a los 2 min del arranque', () => {
  const corte = { ...est(T0 - 3600e3), _conectado: false };
  let r = evaluar(corte, T0, null);
  assert.deepEqual(r.avisos, []);
  r = evaluar(corte, T0 + 130000, r.memoria);
  assert.match(r.avisos[0], /sin comunicacion desde el arranque del sistema/);
  // el retenido con _conectado true sí da la hora: último ciclo bueno
  const r2 = evaluar(est(T0 - 3600e3), T0, null);
  assert.match(r2.avisos[0], /sin comunicacion desde 11:00/);
});

test('mapa incompatible: aviso propio en vez del de comunicación, con repetición y resuelto', () => {
  const inc = (t) => ({ ...est(t), _conectado: false, _mapa: 'incompatible', _version: 1 });
  let r = evaluar(est(T0), T0, null);
  r = evaluar(inc(T0 + MIN), T0 + MIN, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(inc(T0 + 3 * MIN), T0 + 3 * MIN, r.memoria);
  assert.deepEqual(r.avisos, ['🚨 Mapa del PLC incompatible (version 1): cargar la v19']);
  r = evaluar(inc(T0 + 30 * MIN), T0 + 30 * MIN, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(inc(T0 + 64 * MIN), T0 + 64 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);
  r = evaluar(est(T0 + 65 * MIN), T0 + 65 * MIN, r.memoria);
  r = evaluar(est(T0 + 67 * MIN), T0 + 67 * MIN, r.memoria);
  assert.deepEqual(r.avisos, ['✅ resuelto: Mapa del PLC incompatible']);
});

test('sin comunicación: flags congelados (ni nuevos ni resueltos)', () => {
  let r = evaluar(est(T0, A), T0, null);
  const cortado = { ...est(T0 + MIN, { 'C4.alarma_manual': 1 }), _conectado: false };
  r = evaluar(cortado, T0 + 5 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);                      // solo comunicación
  assert.match(r.avisos[0], /sin comunicacion/);
  const sinFlag = { ...est(T0 + MIN), _conectado: false };
  r = evaluar(sinFlag, T0 + 6 * MIN, r.memoria);
  assert.deepEqual(r.avisos, []);                        // ni resuelto de C5 ni repetición
});

test('flag activo antes del corte y después -> 0 avisos al volver; comunicación -> 1 resuelto', () => {
  let r = evaluar(est(T0, A), T0, null);
  r = evaluar({ ...est(T0 + MIN, A), _conectado: false }, T0 + 5 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);
  r = evaluar(est(T0 + 8 * MIN, A), T0 + 8 * MIN, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(est(T0 + 9 * MIN, A), T0 + 9 * MIN, r.memoria);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /^✅ resuelto: PLC sin comunicacion/);
});

test('flag que desaparece durante el corte se resuelve recién al volver', () => {
  let r = evaluar(est(T0, A), T0, null);
  r = evaluar({ ...est(T0), _conectado: false }, T0 + 5 * MIN, r.memoria);
  r = evaluar(est(T0 + 8 * MIN), T0 + 8 * MIN, r.memoria);
  r = evaluar(est(T0 + 9 * MIN), T0 + 9 * MIN, r.memoria);
  assert.equal(r.avisos.length, 2);
  assert.ok(r.avisos.some((a) => a.includes('resuelto: C5: alarma de manual')));
});

test('desvío: usa _tsEstado (frio/estado) y no el _ts del latido', () => {
  const e = { ...est(T0), _tsEstado: T0, _ts: T0 + 25000 };
  assert.equal(evaluar(e, T0 + 25000, null).avisos.length, 0);
  assert.equal(evaluar({ ...e, _tsEstado: T0 - 600e3 }, T0 + 25000, null).avisos.length, 1);
});

test('desvío de reloj > 120 s -> aviso en minutos', () => {
  assert.equal(evaluar(est(T0, {}, { hora_plc: horaPlc(T0, 100) }), T0, null).avisos.length, 0);
  const r = evaluar(est(T0, {}, { hora_plc: horaPlc(T0, -600) }), T0, null);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /Reloj del PLC desviado 10 min/);
});

test('arranque: alarmas ya activas avisan, sin "resuelto"; evaluar no muta la memoria recibida', () => {
  const m0 = { inicio: T0, ultimoOk: null, activos: {} };
  const r = evaluar(est(T0, A), T0, m0);
  assert.equal(r.avisos.length, 1);
  assert.deepEqual(m0.activos, {});
});

test('parpadeo: apagada 1 ciclo y vuelve -> 0 mensajes; apagada 65 s -> 1 resuelto', () => {
  let r = evaluar(est(T0, A), T0, null);
  r = evaluar(est(T0 + 5000), T0 + 5000, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(est(T0 + 10000, A), T0 + 10000, r.memoria);
  assert.deepEqual(r.avisos, []);
  r = evaluar(est(T0 + 20000), T0 + 20000, r.memoria);
  r = evaluar(est(T0 + 85000), T0 + 85000, r.memoria);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /^✅ resuelto/);
});

test('mezclarEstado: el latido (1 s) actualiza _ts/_conectado/_mapa; _tsEstado queda del frio/estado', () => {
  const { mezclarEstado } = require('../src/services/config');
  const e = est(T0);
  assert.equal(mezclarEstado(null, { _ts: T0 }), null);
  assert.deepEqual(mezclarEstado(e, null), { ...e, _tsEstado: T0 });
  const m = mezclarEstado(e, { _ts: T0 + 20000, _conectado: false, _mapa: 'incompatible', _version: 1 });
  assert.equal(m._ts, T0 + 20000); assert.equal(m._tsEstado, T0); assert.equal(m._conectado, false); assert.equal(m._mapa, 'incompatible');
  assert.equal(mezclarEstado({ ...e, _mapa: 'incompatible' }, { _ts: T0 + 1000, _conectado: true })._mapa, undefined);
  assert.equal(mezclarEstado(e, { _ts: T0 - 1000, _conectado: false })._conectado, true); // latido viejo no pisa
});
