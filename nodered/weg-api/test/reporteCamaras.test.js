'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-cam-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.REPORTS_DIR = DIR;

const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/services/reporteCamaras');
const daily = require('../src/services/dailyReport');

const D = (extra) => ({ camara: 'C5', horario: 'H1', etapa: 1, grupos: 'G1', inicio: 1e12, fin: 1e12 + 6e5, duracionS: 600, cortados: '', saltado: false, noEjecutada: false, ...extra });
const lineas = (h) => h[0].rows.map((x) => x[0]);

test('Resumen: descongelados con saltado y sección Compresores con 16 filas', () => {
  const h = r.armarHojas({
    descongelados: [D(), D({ saltado: true, cortados: 'G2' })],
    compresores: [{ camara: 'C4', dia: '2026-10-01', grupo: 'G3', horas: 5.5, horasSinDatos: 1, arranques: 4, maxArranquesHora: 2 }],
    eventos: [{ ts: 1e12, texto: 'C5 alarma', estado: 1 }],
  }, '2026-10-01');
  assert.deepEqual(h.map((x) => x.name), ['Resumen', 'Descongelados', 'Compresores', 'Alarmas y eventos', 'Maniobras', 'Temperaturas']);
  const l = lineas(h);
  assert.ok(l.includes('Descongelados: 2 (1 saltado)'));
  assert.ok(l.includes('Cortados: 1'));
  assert.ok(l.includes('C4: máx. arranques/hora 2 (G3)'));
  assert.ok(l.includes('Alarmas y eventos: 1'));
  assert.ok(l.includes('Horas sin datos: 1'));
  assert.equal(h[2].rows.length, 16);
  assert.deepEqual(h[2].rows.find((x) => x[0] === 'C4' && x[1] === 'G3'), ['C4', 'G3', 5.5, 1, 4, 2]);
  assert.equal(typeof h[2].rows[0][2], 'number');
  assert.deepEqual(h[5].headers, ['Sin datos de temperatura']);
});

test('sin horas sin datos no aparece esa línea', () => {
  assert.ok(!lineas(r.armarHojas({}, '2026-10-01')).some((x) => x.startsWith('Horas sin datos')));
});

test('validarFecha', () => {
  assert.equal(r.validarFecha('2026-10-01'), '2026-10-01');
  for (const f of ['2026-02-30', '2026-1-01', 'x', undefined, '1999-12-31', '2101-01-01', '2999-01-01', 20261001]) {
    assert.throws(() => r.validarFecha(f), (e) => e.status === 400);
  }
});

test('buildAndSend: si Influx falla el mail sale sin adjunto con el aviso', async () => {
  let mail;
  const transport = { sendMail: async (m) => { mail = m; } };
  const res = await daily.buildAndSend('2026-10-01', { to: 'a@b.c', transport, queryCsv: async () => { throw new Error('boom'); } });
  assert.equal(res.emailed, true);
  assert.deepEqual(mail.attachments, []);
  assert.match(mail.html, /No se pudo leer el historial/);
});

test('buildAndSend: con datos adjunta el xlsx', async () => {
  let mail;
  const transport = { sendMail: async (m) => { mail = m; } };
  const res = await daily.buildAndSend('2026-10-01', { to: 'a@b.c', transport, queryCsv: async () => '' });
  assert.equal(res.emailed, true);
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].content.slice(0, 2).toString(), 'PK');
  assert.match(mail.html, /Descongelados: 0 \(0 saltado\)/);
});

test('runScheduled envía una sola vez por fecha', async () => {
  const log = console.log; console.log = () => {};
  const calls = [];
  const orig = r.generarXlsx; r.generarXlsx = async (f) => { calls.push(f); return orig(f, async () => ''); };
  try { await daily.runScheduled(); await daily.runScheduled(); } finally { r.generarXlsx = orig; console.log = log; }
  assert.deepEqual(calls, [r.ayer()]);
});

test('hoja Maniobras: hora, usuario, qué y resultado', () => {
  const h = r.armarHojas({ maniobras: [{ ts: 1e12, usuario: 'ana', accion: 'C5 equipo 3: pasar a manual (antes: automático)', respuesta: 'Listo' }] }, '2026-10-01');
  const x = h.find((s) => s.name === 'Maniobras');
  assert.deepEqual(x.headers, ['Hora', 'Usuario', 'Qué', 'Resultado']);
  assert.deepEqual(x.rows, [['22:46:40', 'ana', 'C5 equipo 3: pasar a manual (antes: automático)', 'Listo']]);
  assert.deepEqual(r.armarHojas({}, '2026-10-01').find((s) => s.name === 'Maniobras').rows, []);
});
