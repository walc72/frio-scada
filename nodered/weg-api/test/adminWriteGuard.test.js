'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { adminWriteGuard } = require('../src/middleware/adminWriteGuard');

async function serve(role) {
  const app = express();
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use(adminWriteGuard);
  const cfg = express.Router();
  cfg.put('/devices', (req, res) => res.send('reached'));
  cfg.get('/', (req, res) => res.send('read'));
  app.use('/api/config', cfg);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { req: (m, p) => fetch(base + p, { method: m }), close: () => new Promise(r => server.close(r)) };
}

test('operador cannot write config, including case and trailing-slash variants', async () => {
  const s = await serve('operador');
  try {
    for (const p of ['/api/config/devices', '/api/CONFIG/devices', '/api/Config/devices/']) {
      assert.equal((await s.req('PUT', p)).status, 403, p);
    }
    assert.equal((await s.req('GET', '/api/CONFIG')).status, 200);
  } finally { await s.close(); }
});

test('admin can write', async () => {
  const s = await serve('admin');
  try {
    assert.equal((await s.req('PUT', '/api/config/devices')).status, 200);
  } finally { await s.close(); }
});
