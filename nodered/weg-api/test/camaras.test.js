'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const s = require('../src/services/camaras');
const createCamarasRouter = require('../src/routes/camaras');

const D = '2026-10-01T03:00:00.000Z'; const H = '2026-10-02T03:00:00.000Z'; // un día local (UTC-3)

test('flux* arman range y filtro de cámara', () => {
  for (const f of [s.fluxDescongelados, s.fluxCompresores]) {
    const q = f({ desde: D, hasta: H, camara: 'C5', bucket: 'camaras' });
    assert.match(q, /range\(start: 2026-10-01T03:00:00.000Z, stop: 2026-10-02T03:00:00.000Z\)/);
    assert.match(q, /r\.camara == "C5"/);
    assert.doesNotMatch(f({ desde: D, hasta: H, bucket: 'camaras' }), /r\.camara/);
  }
  assert.match(s.fluxEventos({ desde: D, hasta: H, bucket: 'camaras' }), /_measurement == "eventos"/);
  assert.match(s.fluxCompresores({ desde: D, hasta: H, bucket: 'camaras' }), /last\(\)/);
});

const CAB = '#datatype,string,long,dateTime:RFC3339,double,string,string,string,string\n,result,table,_time,_value,_field,camara,campo,grupo\n';
const fila = (t, c, v) => `,,0,${t},${v},valor,C5,${c},G1\n`;

const LAT = '#datatype,string,long,dateTime:RFC3339,string,string\n,result,table,_time,_measurement,_value\n';
const foto = (de, a) => { let o = ''; for (let t = Date.parse(de); t <= Date.parse(a); t += 6e4) o += `,,0,${new Date(t).toISOString()},foto,x\n`; return o; };
const com = (t, v) => `,,0,${t},comunicacion,${v}\n`;
const TODO = LAT + foto('2026-09-30T20:00:00Z', '2026-10-05T00:00:00Z');

test('parseCompresores: horas, arranques y máximo por hora', () => {
  const csv = CAB
    + fila('2026-09-30T20:00:00Z', 'comp', 0) + fila('2026-09-30T20:00:00Z', 'arranques', 10)
    + fila('2026-10-01T03:30:00Z', 'comp', 1) + fila('2026-10-01T03:30:00Z', 'arranques', 11)
    + fila('2026-10-01T04:30:00Z', 'comp', 0)
    + fila('2026-10-01T05:10:00Z', 'comp', 1) + fila('2026-10-01T05:10:00Z', 'arranques', 12)
    + fila('2026-10-01T05:20:00Z', 'comp', 0)
    + fila('2026-10-01T05:40:00Z', 'comp', 1) + fila('2026-10-01T05:40:00Z', 'arranques', 13)
    + fila('2026-10-01T05:50:00Z', 'comp', 0);
  const r = s.parseCompresores(csv, { desde: D, hasta: H, ahora: Date.parse(H) + 1e9, latidos: TODO });
  assert.deepEqual(r, [{ camara: 'C5', dia: '2026-10-01', grupo: 'G1', horas: 1.33, horasSinDatos: 0, arranques: 3, maxArranquesHora: 2 }]);
});

test('parseCompresores: estado previo a desde y corte en medianoche', () => {
  const csv = CAB + fila('2026-09-30T20:00:00Z', 'comp', 1) + fila('2026-10-02T04:00:00Z', 'comp', 0);
  const r = s.parseCompresores(csv, { desde: '2026-10-01T03:00:00.000Z', hasta: '2026-10-03T03:00:00.000Z', ahora: Date.parse('2026-10-05'), latidos: TODO });
  assert.deepEqual(r.map((x) => [x.dia, x.horas, x.maxArranquesHora]), [['2026-10-01', 24, 0], ['2026-10-02', 1, 0]]);
});

test('parseCompresores: PLC desconectado no cuenta (comp=1 10:00, caído 11-13, comp=0 14:00 -> 2 h)', () => {
  const csv = CAB + fila('2026-10-01T10:00:00Z', 'comp', 1) + fila('2026-10-01T14:00:00Z', 'comp', 0);
  const lat = LAT + foto('2026-10-01T10:00:00Z', '2026-10-01T10:59:00Z') + com('2026-10-01T11:00:00Z', 'false') + com('2026-10-01T12:00:00Z', 'false')
    + com('2026-10-01T13:00:00Z', 'true') + foto('2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z');
  const [r] = s.parseCompresores(csv, { desde: D, hasta: H, ahora: Date.parse(H), latidos: lat });
  assert.equal(r.horas, 2); assert.equal(r.horasSinDatos, 2);
});

test('parseCompresores: poller caído sin latidos se corta a 15 min', () => {
  const csv = CAB + fila('2026-10-01T10:00:00Z', 'comp', 1) + fila('2026-10-01T14:00:00Z', 'comp', 0);
  const [r] = s.parseCompresores(csv, { desde: D, hasta: H, ahora: Date.parse(H) });
  assert.equal(r.horas, 0.25); assert.equal(r.horasSinDatos, 3.75);
});

test('parseCompresores: reinicio del contador y primer comp=1 sin previo', () => {
  const csv = CAB + fila('2026-10-01T10:00:00Z', 'comp', 1) + fila('2026-10-01T10:00:00Z', 'arranques', 99) + fila('2026-10-01T10:05:00Z', 'arranques', 2);
  const [r] = s.parseCompresores(csv, { desde: D, hasta: H, ahora: Date.parse(H), latidos: TODO });
  assert.equal(r.maxArranquesHora, 0); assert.equal(r.arranques, 2);
});

test('parseDescongelados devuelve las claves del detector', () => {
  const csv = '#datatype,string,long,dateTime:RFC3339,string,string,string,double,string,double,double,double,double\n'
    + ',result,table,_time,camara,horario,etapa,cortados,grupos,duracion_s,fin_ms,no_ejecutada,saltado\n'
    + ',,0,2026-10-01T10:00:00Z,C5,1,1,G2,"G1,G2",600,1790850600000,0,1\n';
  assert.deepEqual(s.parseDescongelados(csv), [{ camara: 'C5', horario: '1', etapa: 1, grupos: 'G1,G2', inicio: Date.parse('2026-10-01T10:00:00Z'),
    fin: 1790850600000, duracionS: 600, cortados: 'G2', saltado: true, noEjecutada: false, interrumpida: false }]);
});

test('parseDescongelados: interrumpida sin fin ni duración', () => {
  const csv = '#datatype,string,long,dateTime:RFC3339,string,string,string,string,string,double,double,double\n'
    + ',result,table,_time,camara,horario,etapa,cortados,grupos,interrumpida,no_ejecutada,saltado\n'
    + ',,0,2026-10-01T10:00:00Z,C5,1,1,,G1,1,0,0\n';
  const [r] = s.parseDescongelados(csv);
  assert.equal(r.interrumpida, true); assert.equal(r.fin, null); assert.equal(r.duracionS, null);
});

test('parseComunicacion: solo cambios de estado (no el desvío), máximo 1000', () => {
  const cab = '#datatype,string,long,dateTime:RFC3339,string,double,double\n,result,table,_time,conectado,descartadas,desvio_reloj_s\n';
  const t = (i) => new Date(Date.parse('2026-10-01T10:00:00Z') + i * 1000).toISOString();
  let csv = cab + `,,0,${t(0)},true,0,1\n,,0,${t(1)},true,0,2\n,,0,${t(2)},false,0,2\n,,0,${t(3)},false,0,\n,,0,${t(4)},true,1,3\n`;
  assert.deepEqual(s.parseComunicacion(csv).map((r) => [r.conectado, r.descartadas]), [[true, 0], [false, 0], [true, 1]]);
  csv = cab; for (let i = 0; i < 2500; i++) csv += `,,0,${t(i)},${i % 2 === 0},0,0\n`;
  const r = s.parseComunicacion(csv);
  assert.equal(r.length, 1000); assert.equal(r.at(-1).ts, Date.parse(t(2499)));
});

test('parseEventos filtra por texto (JS) y cámara', () => {
  const csv = '#datatype,string,long,dateTime:RFC3339,string,double,double\n,result,table,_time,texto,estado,hora_plc\n'
    + ',,0,2026-10-01T10:00:00Z,C5 ALARMA ALTA,1,100\n,,0,2026-10-01T11:00:00Z,C4 Alarma alta,1,200\n';
  assert.equal(s.parseEventos(csv, { texto: 'alta' }).length, 2);
  assert.deepEqual(s.parseEventos(csv, { camara: 'C4', texto: 'ALARMA' }).map((e) => e.hora_plc), ['200']);
});

async function get(path, queryCsv = async () => '') {
  const app = express();
  app.use('/api/camaras', createCamarasRouter({ queryCsv, getEstado: () => ({ _ts: 1 }) }));
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/camaras${path}`);
    return { status: r.status, body: await r.json() };
  } finally { srv.close(); }
}

test('rutas: validación 400 y camino feliz', async () => {
  const ok = `desde=${D}&hasta=${H}`;
  assert.equal((await get('/descongelados?desde=x&hasta=y')).status, 400);
  assert.equal((await get(`/eventos?desde=${H}&hasta=${D}`)).status, 400);
  assert.equal((await get('/compresores?desde=2024-01-01&hasta=2026-01-01')).status, 400);
  assert.equal((await get(`/descongelados?${ok}&camara=C5%22)%20|%3E%20x`)).status, 400);
  assert.equal((await get(`/compresores?${ok}&camara=C9`)).status, 400);
  assert.equal((await get('/eventos?desde=1999-12-31T00:00:00Z&hasta=2000-01-02T00:00:00Z')).status, 400);
  assert.equal((await get('/eventos?desde=2100-12-31T00:00:00Z&hasta=2101-01-02T00:00:00Z')).status, 400);
  const e502 = await get(`/eventos?${ok}`, async () => { throw new Error('secreto interno'); });
  assert.equal(e502.status, 502); assert.doesNotMatch(JSON.stringify(e502.body), /secreto/);
  assert.equal((await get('/estado')).body._ts, 1);
  let flux; const r = await get(`/descongelados?${ok}&camara=C5`, async (q) => { flux = q; return ''; });
  assert.equal(r.status, 200);
  assert.match(flux, /r\.camara == "C5"/);
});
