'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-periodo-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.TZ_OFFSET_MIN = '-180';

const test = require('node:test');
const assert = require('node:assert/strict');
const rp = require('../src/services/reportePeriodo');
const { periodosQueCierran } = require('../src/services/dailyReport');

test('períodos: semana de lunes a domingo, mes calendario, anterior y último completo', () => {
  const s = rp.periodo('semana', '2026-10-22'); // jueves
  assert.deepEqual([s.desde, s.hasta, s.archivo], ['2026-10-19', '2026-10-25', 'reporte-semanal_2026-10-19.pdf']);
  assert.equal(s.nombre, 'semana del 19/10 al 25/10/2026');
  assert.deepEqual([rp.anterior(s).desde, rp.anterior(s).hasta], ['2026-10-12', '2026-10-18']);
  const m = rp.periodo('mes', '2026-02-10');
  assert.deepEqual([m.desde, m.hasta, m.nombre], ['2026-02-01', '2026-02-28', 'febrero 2026']);
  assert.equal(rp.anterior(rp.periodo('mes', '2026-01-15')).desde, '2025-12-01');
  assert.equal(rp.ultimoCompleto('semana', '2026-10-18').desde, '2026-10-12'); // ayer domingo: esa semana
  assert.equal(rp.ultimoCompleto('semana', '2026-10-21').desde, '2026-10-12'); // a mitad de semana: la anterior
  assert.equal(rp.ultimoCompleto('mes', '2026-10-31').desde, '2026-10-01');
  assert.equal(rp.ultimoCompleto('mes', '2026-10-21').desde, '2026-09-01');
  assert.throws(() => rp.periodo('año', '2026-10-21'), /Tipo de reporte inválido/);
});

test('programador: semanal si ayer fue domingo, mensual si ayer cerró el mes', () => {
  const on = { semanal: true, mensual: true };
  assert.deepEqual(periodosQueCierran('2026-10-18', on), ['semana']);
  assert.deepEqual(periodosQueCierran('2026-10-31', on), ['mes']);
  assert.deepEqual(periodosQueCierran('2026-05-31', on), ['semana', 'mes']); // domingo y fin de mes
  assert.deepEqual(periodosQueCierran('2026-10-21', on), []);
  assert.deepEqual(periodosQueCierran('2026-10-18', { semanal: false, mensual: true }), []);
});

const t = (fecha, hhmm) => Date.parse(`${fecha}T${hhmm}:00-03:00`);
const D = (fecha, x = {}) => ({ camara: 'C4', horario: 'H1', etapa: 1, grupos: 'G1', inicio: t(fecha, '06:00'), fin: t(fecha, '06:20'), duracionS: 1200, cortados: '', saltado: false, noEjecutada: false, ...x });
const comp = (horas, extra = {}) => Array.from({ length: 8 }, (_, i) => ({ camara: 'C4', dia: '2026-10-12', grupo: `G${i + 1}`, horas: horas + (extra[i] || 0), horasSinDatos: 0, arranques: 10, maxArranquesHora: 1 }));
const vacio = { descongelados: [], compresores: [], eventos: [], maniobras: [] };

test('armarPeriodo: totales, descongelados por día, comparación, para revisar y caption', () => {
  const p = rp.periodo('semana', '2026-10-12');
  const datos = { ...vacio,
    descongelados: [D('2026-10-12'), D('2026-10-13', { saltado: true }), D('2026-10-14', { cortados: 'G1' })],
    compresores: comp(100, { 2: 40 }), // G3: 140 h en la semana = 20 h/día; resto 100 = 14,3 h/día
    eventos: [{ ts: t('2026-10-13', '10:00'), texto: 'C4 MANUAL PROLONGADO', estado: 1 }, { ts: t('2026-10-13', '11:30'), texto: 'C4 MANUAL PROLONGADO', estado: 0 }],
    maniobras: [{ ts: t('2026-10-14', '09:00'), maniobra: true, usuario: 'ana', accion: 'x', texto: 'ana: x', camara: 'C4', estado: 1, comando: 'modo' },
      { ts: t('2026-10-14', '09:05'), maniobra: true, usuario: 'ana', accion: 'Vio la alarma: y', texto: 'ana: Vio', camara: 'C4', estado: 1, comando: 'visto' }],
  };
  const previo = { ...vacio, descongelados: [D('2026-10-06')], compresores: comp(80) };
  const m = rp.armarPeriodo(p, datos, previo);
  const c4 = m.camaras.find((c) => c.camara === 'C4');
  assert.equal(m.titulo, 'Reporte semanal de cámaras — semana del 12/10 al 18/10/2026');
  assert.deepEqual([c4.resumen.hechos, c4.resumen.saltados, c4.resumen.cortados, c4.resumen.maniobras, c4.resumen.alarmas], [2, 1, 1, 1, 1]); // el visto no es maniobra
  assert.deepEqual(c4.tablas[0].filas.slice(0, 3), [['12/10', '1', '0', '0', '0'], ['13/10', '0', '0', '1', '0'], ['14/10', '1', '1', '0', '0']]);
  assert.equal(c4.tablas[0].filas.length, 7);
  assert.equal(c4.extra[0], 'Alarmas activas en total: 1 h 30 min');
  assert.match(c4.extra[1], /^Comparado con la semana anterior: horas de marcha \+31 % · arranques \+0 % · alarmas 1 \(antes 0\) · descongelados hechos 2 \(antes 1\)$/);
  assert.deepEqual(c4.distintos.map((d) => d.grupo), ['G3']);
  assert.match(m.caption, /^Reporte semanal: semana del 12\/10 al 18\/10\/2026 · Cámara 4: 2 de 3 descongelados ⚠ · .* · ⚠ revisar: Cámara 4 Equipo 3$/);
  assert.equal(rp.armarPeriodo(p, vacio).camaras[0].extra.length, 1); // sin previo: sin comparación
  assert.equal(rp.armarPeriodo(p, datos, vacio).camaras[0].extra[1], 'Comparado con la semana anterior: no hay datos para comparar');
  // promedio por día sobre los días con datos (acá 1: todas las filas son del 12/10)
  assert.equal(c4.tablas[1].filas[0][2], '100');
});

test('PDF semanal y mensual: se generan con el lector inyectado (sin Influx)', async () => {
  for (const tipo of ['semana', 'mes']) {
    const { pdf, nombre, modelo } = await rp.generarPdf(tipo, '2026-10-12', { queryCsv: async () => '' });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.match(nombre, tipo === 'semana' ? /^reporte-semanal_2026-10-12\.pdf$/ : /^reporte-mensual_2026-10\.pdf$/);
    assert.equal(modelo.camaras[0].trend, null);
  }
});
