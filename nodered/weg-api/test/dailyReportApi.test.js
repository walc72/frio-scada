'use strict';

// API del reporte diario: /api/settings/daily-report (+ /enviar) y /api/reportes/diario.pdf. Sin red ni Influx.
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-api-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.REPORTS_DIR = DIR;
delete process.env.TELEGRAM_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
fs.writeFileSync(process.env.CONFIG_PATH, '{}');

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const settings = require('../src/services/settings');
const daily = require('../src/services/dailyReport');
const reporteDiario = require('../src/services/reporteDiario');
const settingsRoutes = require('../src/routes/settings');
const { diarioPdf } = require('../src/routes/reports');
const { requireAuth } = require('../src/middleware/auth');

const FAKE = '123456:' + 'A'.repeat(35);

async function servir(rol, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { if (rol) req.auth = { role: rol, user: 'x' }; next(); });
  app.use('/api/settings', settingsRoutes);
  if (!rol) app.use(requireAuth); // sin sesión: el requireAuth real (en server.js diario.pdf va después de él)
  app.get('/api/reportes/diario.pdf', diarioPdf);
  const srv = app.listen(0);
  const f = (p, method = 'GET', body) => fetch(`http://127.0.0.1:${srv.address().port}${p}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  try { return await fn(f); } finally { srv.close(); }
}

test('GET/POST daily-report incluyen canales y si Telegram está configurado', async () => {
  await servir('admin', async (f) => {
    let r = await (await f('/api/settings/daily-report')).json();
    assert.deepEqual(r.canales, { correo: true, telegram: false });
    assert.equal(r.telegramConfigurado, false);
    settings.setTelegram({ token: FAKE, chatId: '-100' });
    r = await (await f('/api/settings/daily-report')).json();
    assert.deepEqual([r.canales.telegram, r.telegramConfigurado], [true, true]);
    assert.ok(!JSON.stringify(r).includes(FAKE));
    const p = await f('/api/settings/daily-report', 'POST', { canales: { telegram: false } });
    assert.equal(p.status, 200);
    assert.deepEqual((await p.json()).canales, { correo: true, telegram: false });
    assert.equal((await f('/api/settings/daily-report', 'POST', { canales: { correo: 'sí' } })).status, 400);
  });
});

test('enviar: solo admin', async () => {
  const orig = daily.buildAndSend;
  daily.buildAndSend = async () => { throw new Error('no debe llamarse'); };
  try {
    await servir('operador', async (f) => { assert.equal((await f('/api/settings/daily-report/enviar', 'POST', {})).status, 403); });
  } finally { daily.buildAndSend = orig; }
});

test('enviar: manda el de ayer, devuelve el resultado por canal y limita a 1 por minuto', async () => {
  const orig = daily.buildAndSend;
  const llamadas = [];
  daily.buildAndSend = async (fecha) => { llamadas.push(fecha); return { date: '2026-10-17', saved: true, path: '/app/reports/x.pdf', correo: 'ok', telegram: 'error: HTTP 400' }; };
  try {
    await servir('admin', async (f) => {
      const r = await f('/api/settings/daily-report/enviar', 'POST', {});
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true, date: '2026-10-17', correo: 'ok', telegram: 'error: HTTP 400' });
      const r2 = await f('/api/settings/daily-report/enviar', 'POST', {});
      assert.equal(r2.status, 429);
      assert.match((await r2.json()).error, /Esperá un minuto/);
    });
  } finally { daily.buildAndSend = orig; }
  assert.deepEqual(llamadas, [undefined]); // sin fecha: buildAndSend usa ayer
});

test('diario.pdf: con sesión baja el PDF del día; fecha inválida 400; sin sesión 401', async () => {
  const orig = reporteDiario.generarPdf;
  const fechas = [];
  reporteDiario.generarPdf = async (fecha) => { fechas.push(fecha); return orig(fecha, { queryCsv: async () => '' }); };
  try {
    await servir('operador', async (f) => {
      const r = await f('/api/reportes/diario.pdf?fecha=2026-10-01');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'application/pdf');
      assert.match(r.headers.get('content-disposition'), /reporte-camaras_2026-10-01\.pdf/);
      assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
      assert.equal((await f('/api/reportes/diario.pdf?fecha=2026-02-30')).status, 400);
      assert.equal((await f('/api/reportes/diario.pdf?fecha=2999-01-01')).status, 400);
    });
    await servir(null, async (f) => { assert.equal((await f('/api/reportes/diario.pdf?fecha=2026-10-01')).status, 401); });
  } finally { reporteDiario.generarPdf = orig; }
  assert.deepEqual(fechas, ['2026-10-01']);
});
