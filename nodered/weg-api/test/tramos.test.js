'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const s = require('../src/services/camaras');
const createCamarasRouter = require('../src/routes/camaras');

const D = '2026-10-01T03:00:00.000Z'; const H = '2026-10-02T03:00:00.000Z'; // un día local (UTC-3)
const CAB = '#datatype,string,long,dateTime:RFC3339,string,string,string\n,result,table,_time,_value,camara,grupo\n';
const est = (t, v) => `,,0,${t},${v},C5,G1\n`;
const LAT = '#datatype,string,long,dateTime:RFC3339,string,string\n,result,table,_time,_measurement,_value\n';
const foto = (de, a) => { let o = ''; for (let t = Date.parse(de); t <= Date.parse(a); t += 6e4) o += `,,0,${new Date(t).toISOString()},foto,x\n`; return o; };
const TODO = LAT + foto('2026-09-30T20:00:00Z', '2026-10-05T00:00:00Z');
const tr = (csv, extra = {}) => s.parseTramos(csv, { desde: D, hasta: H, ahora: Date.parse(H) + 1e9, latidos: TODO, ...extra })
  .map((t) => [t.grupo, t.inicio.slice(11, 16), t.fin.slice(11, 16), t.estado]);

test('fluxTramos pide el texto de estado de grupos y filtra cámara', () => {
  const q = s.fluxTramos({ desde: D, hasta: H, camara: 'C5', bucket: 'camaras' });
  assert.match(q, /r\._field == "texto" and r\.campo == "estado" and exists r\.grupo/);
  assert.match(q, /r\.camara == "C5"/);
});

test('parseTramos: FRIO y luego DESCONGELANDO -> 2 tramos', () => {
  const csv = CAB + est('2026-09-30T20:00:00Z', 'FRIO') + est('2026-10-01T08:06:00Z', 'DESCONGELANDO') + est('2026-10-01T08:12:00Z', 'FRIO');
  assert.deepEqual(tr(csv, { hasta: '2026-10-01T08:12:00.000Z' }), [['G1', '03:00', '08:06', 'frio'], ['G1', '08:06', '08:12', 'descongelando']]);
});

test('parseTramos: ESCURRIENDO, ALARMA RES y MANUAL cuentan como frio', () => {
  const csv = CAB + est('2026-09-30T20:00:00Z', 'FRIO') + est('2026-10-01T05:00:00Z', 'ESCURRIENDO') + est('2026-10-01T06:00:00Z', 'ALARMA RES') + est('2026-10-01T07:00:00Z', 'MANUAL');
  assert.deepEqual(tr(csv, { hasta: '2026-10-01T08:00:00.000Z' }), [['G1', '03:00', '08:00', 'frio']]);
});

test('parseTramos: hueco de 2 h sin latidos -> sin-datos en el medio', () => {
  const lat = LAT + foto('2026-09-30T20:00:00Z', '2026-10-01T05:00:00Z') + foto('2026-10-01T07:00:00Z', '2026-10-05T00:00:00Z');
  const csv = CAB + est('2026-09-30T20:00:00Z', 'FRIO');
  assert.deepEqual(tr(csv, { latidos: lat, hasta: '2026-10-01T09:00:00.000Z' }),
    [['G1', '03:00', '05:15', 'frio'], ['G1', '05:15', '07:00', 'sin-datos'], ['G1', '07:00', '09:00', 'frio']]);
});

test('parseTramos: sin dato previo es sin-datos hasta el primer cambio; se corta en hasta', () => {
  const csv = CAB + est('2026-10-01T05:00:00Z', 'FRIO');
  assert.deepEqual(tr(csv), [['G1', '03:00', '05:00', 'sin-datos'], ['G1', '05:00', '03:00', 'frio']]);
  assert.equal(s.parseTramos(csv, { desde: D, hasta: H, ahora: Date.parse(H) + 1e9, latidos: TODO }).at(-1).fin, H);
});

async function get(path, queryCsv = async () => '') {
  const app = express();
  app.use('/api/camaras', createCamarasRouter({ queryCsv, getEstado: () => ({}) }));
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/camaras${path}`);
    return { status: r.status, body: await r.json() };
  } finally { srv.close(); }
}

test('/tramos: camara inválida 400 y camino feliz', async () => {
  assert.equal((await get(`/tramos?desde=${D}&hasta=${H}&camara=C9`)).status, 400);
  assert.equal((await get('/tramos?desde=x&hasta=y')).status, 400);
  const r = await get(`/tramos?desde=${D}&hasta=${H}&camara=C5`, async (q) => (q.includes('"foto"') ? TODO : CAB + est('2026-09-30T20:00:00Z', 'FRIO')));
  assert.equal(r.status, 200);
  assert.equal(r.body[0].estado, 'frio');
});
