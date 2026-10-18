'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cfg-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
delete process.env.TELEGRAM_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const https = require('https');
const settings = require('../src/services/settings');
const alerts = require('../src/services/alerts');
const settingsRoutes = require('../src/routes/settings');

const FAKE = '123456:' + 'A'.repeat(35);
const FAKE2 = '654321:' + 'B'.repeat(35);
const reset = () => { try { fs.unlinkSync(settings.SETTINGS_PATH); } catch { /* no existe */ } };

async function servir(rol, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: rol, user: 'x' }; next(); });
  app.use('/api/settings', settingsRoutes);
  const srv = app.listen(0);
  const f = (method, body) => fetch(`http://127.0.0.1:${srv.address().port}/api/settings/telegram`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  try { return await fn(f); } finally { srv.close(); }
}

test('GET nunca devuelve el token, solo hasToken; token vacío conserva el anterior', async () => {
  reset();
  await servir('admin', async (f) => {
    assert.deepEqual((await f('GET')).body, { chatId: '', hasToken: false });
    assert.equal((await f('POST', { token: FAKE, chatId: '-1001234567' })).status, 200);
    const g = await f('GET');
    assert.deepEqual(g.body, { chatId: '-1001234567', hasToken: true });
    assert.ok(!JSON.stringify(g.body).includes(FAKE));
    assert.ok(!JSON.stringify((await f('POST', { token: '', chatId: '@micanal' })).body).includes(FAKE));
    assert.equal(settings.getTelegramFull().token, FAKE);
    assert.equal(settings.getTelegramFull().chatId, '@micanal');
  });
});

test('token o chat inválidos: 400 y no pisan lo guardado', async () => {
  reset();
  await servir('admin', async (f) => {
    await f('POST', { token: FAKE, chatId: '42' });
    for (const bad of [{ token: 'abc' }, { token: '123:short' }, { token: FAKE + ' x' }, { chatId: 'hola' }, { chatId: '@ab' }, { chatId: '12-3' }]) {
      const r = await f('POST', bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.match(r.body.error, /inválido/);
    }
    assert.deepEqual(settings.getTelegramFull(), { token: FAKE, chatId: '42' });
  });
});

test('no admin: 403', async () => {
  reset();
  await servir('operador', async (f) => {
    assert.equal((await f('GET')).status, 403);
    assert.equal((await f('POST', { token: FAKE, chatId: '1' })).status, 403);
  });
});

test('alerts: settings gana sobre el env; env si settings está vacío; sendTelegram usa settings', async () => {
  reset();
  assert.equal(alerts.telegramConfigurado(), false);
  process.env.TELEGRAM_TOKEN = FAKE2;
  process.env.TELEGRAM_CHAT_ID = '999';
  assert.equal(alerts.telegramConfigurado(), true);
  assert.deepEqual(settings.getTelegramFull(), { token: FAKE2, chatId: '999' });
  settings.setTelegram({ token: FAKE, chatId: '-5' });
  assert.deepEqual(settings.getTelegramFull(), { token: FAKE, chatId: '-5' });

  const orig = https.request;
  let visto;
  https.request = (url, opts, cb) => {
    visto = { url: String(url), body: '' };
    const { EventEmitter } = require('events');
    const req = new EventEmitter();
    req.end = (b) => { visto.body = b; const res = new EventEmitter(); res.statusCode = 200; res.resume = () => {}; cb(res); };
    return req;
  };
  try { await alerts.sendTelegram('hola'); } finally { https.request = orig; delete process.env.TELEGRAM_TOKEN; delete process.env.TELEGRAM_CHAT_ID; }
  assert.equal(visto.url, `https://api.telegram.org/bot${FAKE}/sendMessage`);
  assert.equal(JSON.parse(visto.body).chat_id, '-5');
});
