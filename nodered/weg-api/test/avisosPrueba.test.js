'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createAvisosRouter = require('../src/routes/avisos');
const createSistemaResumenRouter = require('../src/routes/sistemaResumen');

async function servir(rol, router, base, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: rol, user: 'x' }; next(); });
  app.use(base, router);
  const srv = app.listen(0);
  const f = (path, body) => fetch(`http://127.0.0.1:${srv.address().port}${base}${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  try { return await fn(f); } finally { srv.close(); }
}

test('avisos/prueba: operador 403', async () => {
  const r = await servir('operador', createAvisosRouter({ notifyCanal: async () => { throw new Error('no debe llamarse'); } }), '/api/avisos', (f) => f('/prueba', { canal: 'telegram' }));
  assert.equal(r.status, 403);
});

test('avisos/prueba: ok, límite de 1 por minuto por canal, canal inválido', async () => {
  const enviados = [];
  const router = createAvisosRouter({ notifyCanal: async (c, t) => { enviados.push([c, t]); } });
  await servir('admin', router, '/api/avisos', async (f) => {
    assert.deepEqual((await f('/prueba', { canal: 'telegram' })).body, { ok: true });
    const seg = await f('/prueba', { canal: 'telegram' });
    assert.equal(seg.status, 429);
    assert.deepEqual(seg.body, { ok: false, error: 'Esperá un minuto antes de probar de nuevo' });
    assert.equal((await f('/prueba', { canal: 'mail' })).status, 200); // otro canal: su propio límite
    assert.equal((await f('/prueba', { canal: 'sms' })).status, 400);
  });
  assert.match(enviados[0][1], /^\u2705 Aviso de prueba de frio-scada \(\d\d:\d\d\)$/);
});

test('avisos/prueba: tras un fallo se puede reintentar enseguida', async () => {
  let falla = true;
  const router = createAvisosRouter({ notifyCanal: async () => { if (falla) throw new Error('El mail no está configurado'); } });
  await servir('admin', router, '/api/avisos', async (f) => {
    assert.equal((await f('/prueba', { canal: 'mail' })).body.ok, false);
    falla = false;
    assert.deepEqual((await f('/prueba', { canal: 'mail' })).body, { ok: true });
    assert.equal((await f('/prueba', { canal: 'mail' })).status, 429);
  });
});

test('avisos/prueba: canal que falla -> 200 {ok:false,error legible}', async () => {
  const router = createAvisosRouter({ notifyCanal: async () => { throw new Error('Telegram no está configurado'); } });
  const r = await servir('superadmin', router, '/api/avisos', (f) => f('/prueba', { canal: 'telegram' }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: false, error: 'Telegram no está configurado' });
});

test('sistema/resumen: lo desconocido va null', async () => {
  const router = createSistemaResumenRouter({
    queryCsv: async () => { throw new Error('influx caído'); }, getEstado: () => null,
    telegramConfigurado: () => false, mailConfigurado: () => true, desvioRelojS: () => null, backupDir: '/no/existe',
  });
  const r = await servir('operador', router, '/api/sistema', (f) => f('/resumen'));
  assert.deepEqual(r.body, {
    replica: false, plc: { conectado: null, mapaVersion: null, programa: null, desvioRelojS: null },
    historial: { ultimaEscritura: null }, telegram: { configurado: false }, mail: { configurado: true },
    copia: { ultima: null }, cortes7d: { cantidad: null, minutos: null },
  });
});

test('sistema/resumen: cortes de 7 días y estado vivo', async () => {
  const csv = '#datatype,string,long,dateTime:RFC3339,boolean\n,result,table,_time,conectado\n'
    + ',,0,2026-10-15T10:00:00Z,false\n,,0,2026-10-15T10:30:00Z,true\n,,0,2026-10-16T11:00:00Z,false\n';
  const router = createSistemaResumenRouter({
    queryCsv: async (q) => (q.includes('"comunicacion"') ? csv : ''), ahora: () => Date.parse('2026-10-16T12:00:00Z'),
    getEstado: () => ({ _conectado: true, _ts: Date.parse('2026-10-16T11:59:00Z'), _version: 2, version_programa: 20 }),
    telegramConfigurado: () => true, mailConfigurado: () => false, desvioRelojS: () => 3.4, backupDir: '/no/existe',
  });
  const r = await servir('operador', router, '/api/sistema', (f) => f('/resumen'));
  assert.deepEqual(r.body.plc, { conectado: true, mapaVersion: 2, programa: 20, desvioRelojS: 3 });
  assert.deepEqual(r.body.cortes7d, { cantidad: 2, minutos: 90 });
});

test('sistema/resumen: estado viejo (más de 2 min) no cuenta como conectado', async () => {
  const router = createSistemaResumenRouter({
    queryCsv: async () => '', ahora: () => Date.parse('2026-10-16T12:00:00Z'),
    getEstado: () => ({ _conectado: true, _ts: Date.parse('2026-10-16T11:50:00Z') }),
    telegramConfigurado: () => true, mailConfigurado: () => false, desvioRelojS: () => null, backupDir: '/no/existe',
  });
  assert.equal((await servir('operador', router, '/api/sistema', (f) => f('/resumen'))).body.plc.conectado, false);
});

test('sistema/resumen: la consulta de foto mira un solo campo siempre escrito', async () => {
  let q = '';
  const router = createSistemaResumenRouter({
    queryCsv: async (x) => { if (x.includes('"foto"')) q = x; return ''; }, getEstado: () => null,
    telegramConfigurado: () => false, mailConfigurado: () => false, desvioRelojS: () => null, backupDir: '/no/existe',
  });
  await servir('operador', router, '/api/sistema', (f) => f('/resumen'));
  assert.match(q, /range\(start: -2d\)/);
  assert.match(q, /r\._field == "hora_plc"/);
  assert.match(q, /\|> last\(\)/);
});

test('replica: avisos/prueba 409 y resumen replica:true', async () => {
  const router = createAvisosRouter({ isReplica: true, notifyCanal: async () => { throw new Error('no debe llamarse'); } });
  const r = await servir('admin', router, '/api/avisos', (f) => f('/prueba', { canal: 'telegram' }));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { ok: false, error: 'Los avisos se envían desde la planta' });
  const rs = createSistemaResumenRouter({ queryCsv: async () => '', getEstado: () => null, telegramConfigurado: () => false, mailConfigurado: () => false, desvioRelojS: () => null, isReplica: true, backupDir: '/no/existe' });
  assert.equal((await servir('operador', rs, '/api/sistema', (f) => f('/resumen'))).body.replica, true);
});
